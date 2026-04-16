import { requireSession } from '@/lib/appAuth';
import { PermissionDeniedError } from '@/lib/groupPermissions';
import { enforceSameOrigin, getClientIp, isUuid, jsonError } from '@/lib/http';
import { GroupMutedError, IpRestrictedError, MessageCooldownError, MessageSpamError, socialStore } from '@/lib/socialStore';
import { findFirstTenorUrl, resolveTenorGifFromInput, stripTenorUrlFromText } from '@/lib/tenor';
import { validateMessage, validatePollOptions, validatePollQuestion } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MessagePayload = {
  chatId?: string;
  text?: string;
  attachmentIds?: string[];
  replyToMessageId?: string | null;
  gif?: {
    url?: string;
    previewUrl?: string | null;
    tenorId?: string | null;
    title?: string | null;
  } | null;
  poll?: {
    question?: string;
    options?: string[];
  } | null;
};

export async function POST(request: Request): Promise<Response> {
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  let payload: MessagePayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const chatId = payload.chatId?.trim() ?? '';
  if (!chatId || !isUuid(chatId)) {
    return jsonError('Invalid chatId.', 422);
  }

  let text = payload.text?.trim() ?? '';
  if (text) {
    const textError = validateMessage(text, 4000);
    if (textError) {
      return jsonError(textError, 422);
    }
  }

  const attachmentIds = Array.isArray(payload.attachmentIds) ? payload.attachmentIds : [];
  const hasInvalidAttachmentId = attachmentIds.some((id) => typeof id !== 'string' || !isUuid(id));
  if (hasInvalidAttachmentId) {
    return jsonError('Invalid attachmentIds.', 422);
  }

  const replyToMessageId = payload.replyToMessageId?.trim() ?? '';
  if (replyToMessageId && !isUuid(replyToMessageId)) {
    return jsonError('Invalid replyToMessageId.', 422);
  }

  const poll = payload.poll ?? null;
  if (poll) {
    const question = poll.question?.trim() ?? '';
    const options = Array.isArray(poll.options) ? poll.options : [];
    const questionError = validatePollQuestion(question);
    if (questionError) {
      return jsonError(questionError, 422);
    }
    const optionsError = validatePollOptions(options);
    if (optionsError) {
      return jsonError(optionsError, 422);
    }
  }

  let gif = payload.gif ?? null;
  if (!gif?.url?.trim() && text) {
    const tenorUrl = findFirstTenorUrl(text);
    if (tenorUrl) {
      const resolved = await resolveTenorGifFromInput(tenorUrl);
      if (resolved) {
        gif = {
          url: resolved.url,
          previewUrl: resolved.previewUrl,
          tenorId: resolved.id,
          title: resolved.title
        };
        text = stripTenorUrlFromText(text, tenorUrl);
      }
    }
  }
  const hasGif = Boolean(gif?.url?.trim());
  const hasPoll = Boolean(poll);
  const hasAttachments = attachmentIds.length > 0;
  if (!text && !hasGif && !hasPoll && !hasAttachments) {
    return jsonError('Message cannot be empty.', 422);
  }

  try {
    const message = await socialStore.addMessage(auth.session.user.id, chatId, {
      text,
      attachmentIds,
      replyToMessageId: replyToMessageId || null,
      gif: hasGif
        ? {
            url: String(gif?.url ?? ''),
            previewUrl: gif?.previewUrl ?? null,
            tenorId: gif?.tenorId ?? null,
            title: gif?.title ?? null
          }
        : null,
      poll: hasPoll
        ? {
            question: String(poll?.question ?? ''),
            options: Array.isArray(poll?.options) ? poll.options : []
          }
        : null
    }, getClientIp(request));
    return Response.json({ message });
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return jsonError(error.message, 403);
    }
    if (error instanceof GroupMutedError) {
      return Response.json(
        {
          error: error.message,
          retryAfterMs: error.retryAfterMs
        },
        {
          status: 403,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': String(Math.max(1, Math.ceil(error.retryAfterMs / 1000)))
          }
        }
      );
    }
    if (error instanceof MessageSpamError) {
      return Response.json(
        {
          error: error.message,
          retryAfterMs: error.retryAfterMs
        },
        {
          status: 429,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': String(Math.max(1, Math.ceil(error.retryAfterMs / 1000)))
          }
        }
      );
    }
    if (error instanceof MessageCooldownError) {
      return Response.json(
        {
          error: error.message,
          retryAfterMs: error.retryAfterMs
        },
        {
          status: 429,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': String(Math.max(1, Math.ceil(error.retryAfterMs / 1000)))
          }
        }
      );
    }
    if (error instanceof IpRestrictedError) {
      if (error.statusCode === 429 && error.retryAfterMs) {
        return Response.json(
          {
            error: error.message,
            retryAfterMs: error.retryAfterMs
          },
          {
            status: 429,
            headers: {
              'Cache-Control': 'no-store',
              'Retry-After': String(Math.max(1, Math.ceil(error.retryAfterMs / 1000)))
            }
          }
        );
      }
      return jsonError(error.message, error.statusCode);
    }
    return jsonError(error instanceof Error ? error.message : 'Message failed.', 422);
  }
}
