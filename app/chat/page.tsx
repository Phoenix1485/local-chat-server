'use client';

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ChatContext, ChatMessage, UserStatus } from '@/types/chat';

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const statusLabels: Record<UserStatus, string> = {
  pending: 'wartend',
  approved: 'online',
  rejected: 'abgelehnt'
};

type JsonErrorPayload = {
  error?: string;
};

async function readJsonError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as JsonErrorPayload;
    if (payload && typeof payload.error === 'string' && payload.error.trim().length > 0) {
      return payload.error;
    }
  } catch {
    // ignored
  }

  return fallback;
}

function ChatPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [context, setContext] = useState<ChatContext | null>(null);
  const [activeChatId, setActiveChatId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [newChatName, setNewChatName] = useState('');
  const [inviteTargetId, setInviteTargetId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [isLeavingChat, setIsLeavingChat] = useState(false);
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [sessionStatus, setSessionStatus] = useState<UserStatus>('approved');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const hasRedirectedRef = useRef(false);

  const sessionId = useMemo(() => params.get('sessionId') ?? '', [params]);
  const queryChatId = useMemo(() => params.get('chatId') ?? '', [params]);

  const loadContext = useCallback(
    async (chatId?: string, options?: { silent?: boolean }) => {
      if (!sessionId) {
        return;
      }

      const targetChatId = (chatId ?? activeChatId ?? '').trim();

      try {
        const query = new URLSearchParams({ sessionId });
        if (targetChatId) {
          query.set('chatId', targetChatId);
        }

        const response = await fetch(`/api/chat/rooms?${query.toString()}`, { cache: 'no-store' });
        if (!response.ok) {
          const message = await readJsonError(response, 'Chats konnten nicht geladen werden.');

          if (response.status === 403 && !hasRedirectedRef.current) {
            hasRedirectedRef.current = true;
            router.replace(`/waiting?sessionId=${encodeURIComponent(sessionId)}`);
            return;
          }

          throw new Error(message);
        }

        const payload = (await response.json()) as ChatContext;
        setContext(payload);
        setActiveChatId(payload.activeChat.id);

        const nextUrl = `/chat?sessionId=${encodeURIComponent(sessionId)}&chatId=${encodeURIComponent(payload.activeChat.id)}`;
        const currentUrl = `/chat?sessionId=${encodeURIComponent(sessionId)}&chatId=${encodeURIComponent(queryChatId)}`;
        if (nextUrl !== currentUrl) {
          router.replace(nextUrl);
        }
      } catch (requestError) {
        if (!options?.silent) {
          setError(requestError instanceof Error ? requestError.message : 'Chats konnten nicht geladen werden.');
        }
      }
    },
    [activeChatId, queryChatId, router, sessionId]
  );

  useEffect(() => {
    hasRedirectedRef.current = false;

    if (!sessionId) {
      const stored = localStorage.getItem('chat_session_id');
      if (!stored) {
        router.replace('/');
        return;
      }
      router.replace(`/chat?sessionId=${encodeURIComponent(stored)}`);
      return;
    }

    localStorage.setItem('chat_session_id', sessionId);
    void loadContext(queryChatId || undefined);
  }, [loadContext, queryChatId, router, sessionId]);

  useEffect(() => {
    if (!sessionId || !activeChatId) {
      return;
    }

    const refreshTimer = setInterval(() => {
      void loadContext(activeChatId, { silent: true });
    }, 4500);

    return () => {
      clearInterval(refreshTimer);
    };
  }, [activeChatId, loadContext, sessionId]);

  useEffect(() => {
    if (!sessionId || !activeChatId) {
      return;
    }

    setConnectionState('connecting');
    setMessages([]);

    const stream = new EventSource(
      `/api/chat/stream?sessionId=${encodeURIComponent(sessionId)}&chatId=${encodeURIComponent(activeChatId)}`
    );

    stream.addEventListener('history', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { messages: ChatMessage[] };
      setMessages(payload.messages);
      setConnectionState('live');
    });

    stream.addEventListener('message', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { message: ChatMessage };
      setMessages((prev) => [...prev, payload.message]);
    });

    stream.addEventListener('chat', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { status?: string };
      if (payload.status === 'unavailable') {
        void loadContext(undefined, { silent: true });
      }
    });

    stream.addEventListener('session', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { status: UserStatus };
      setSessionStatus(payload.status);

      if (payload.status === 'approved' || hasRedirectedRef.current) {
        return;
      }

      hasRedirectedRef.current = true;
      if (payload.status === 'pending') {
        setError('Du wurdest vom Admin aus dem Chat entfernt. Zurueck in den Warteraum...');
        router.replace(`/waiting?sessionId=${encodeURIComponent(sessionId)}`);
        return;
      }

      localStorage.removeItem('chat_session_id');
      setError('Dein Zugriff wurde entzogen.');
      router.replace('/');
    });

    stream.onerror = () => {
      if (hasRedirectedRef.current) {
        return;
      }
      setConnectionState('error');
      setError('Echtzeit-Verbindung getrennt. Verbindung wird neu aufgebaut...');
    };

    return () => {
      stream.close();
    };
  }, [activeChatId, loadContext, router, sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim() || !sessionId || !activeChatId) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, chatId: activeChatId, text })
      });
      if (!response.ok) {
        throw new Error(await readJsonError(response, 'Nachricht konnte nicht gesendet werden.'));
      }
      setText('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Nachricht konnte nicht gesendet werden.');
    } finally {
      setIsSending(false);
    }
  };

  const uploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !sessionId || !activeChatId) {
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set('sessionId', sessionId);
      formData.set('chatId', activeChatId);
      formData.set('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(await readJsonError(response, 'Upload fehlgeschlagen.'));
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Upload fehlgeschlagen.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const createChat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sessionId || !newChatName.trim()) {
      return;
    }

    setIsCreatingChat(true);
    setError(null);

    try {
      const response = await fetch('/api/chat/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, name: newChatName.trim() })
      });

      if (!response.ok) {
        throw new Error(await readJsonError(response, 'Chat konnte nicht erstellt werden.'));
      }

      const payload = (await response.json()) as { context: ChatContext };
      setContext(payload.context);
      setActiveChatId(payload.context.activeChat.id);
      setNewChatName('');
      setInviteTargetId('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Chat konnte nicht erstellt werden.');
    } finally {
      setIsCreatingChat(false);
    }
  };

  const inviteUser = async () => {
    if (!sessionId || !activeChatId || !inviteTargetId) {
      return;
    }

    setIsInviting(true);
    setError(null);

    try {
      const response = await fetch('/api/chat/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, chatId: activeChatId, targetUserId: inviteTargetId })
      });

      if (!response.ok) {
        throw new Error(await readJsonError(response, 'Einladung fehlgeschlagen.'));
      }

      const payload = (await response.json()) as { context: ChatContext };
      setContext(payload.context);
      setInviteTargetId('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Einladung fehlgeschlagen.');
    } finally {
      setIsInviting(false);
    }
  };

  const leaveChat = async () => {
    if (!sessionId || !activeChatId) {
      return;
    }

    setIsLeavingChat(true);
    setError(null);

    try {
      const response = await fetch('/api/chat/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, chatId: activeChatId })
      });

      if (!response.ok) {
        throw new Error(await readJsonError(response, 'Chat konnte nicht verlassen werden.'));
      }

      const payload = (await response.json()) as { context: ChatContext };
      setContext(payload.context);
      setActiveChatId(payload.context.activeChat.id);
      setMessages([]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Chat konnte nicht verlassen werden.');
    } finally {
      setIsLeavingChat(false);
    }
  };

  const deactivateChat = async () => {
    if (!sessionId || !activeChatId) {
      return;
    }

    setIsDeletingChat(true);
    setError(null);

    try {
      const response = await fetch('/api/chat/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, chatId: activeChatId })
      });

      if (!response.ok) {
        throw new Error(await readJsonError(response, 'Chat konnte nicht deaktiviert werden.'));
      }

      const payload = (await response.json()) as { context: ChatContext };
      setContext(payload.context);
      setActiveChatId(payload.context.activeChat.id);
      setMessages([]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Chat konnte nicht deaktiviert werden.');
    } finally {
      setIsDeletingChat(false);
    }
  };

  const activeChat = context?.activeChat ?? null;
  const chats = context?.chats ?? [];
  const members = context?.members ?? [];
  const inviteCandidates = context?.inviteCandidates ?? [];

  return (
    <main className="grid gap-4 md:grid-cols-[1fr_320px]">
      <section className="glass-panel flex h-[calc(100dvh-10.5rem)] min-h-0 max-h-[calc(100dvh-10.5rem)] flex-col rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between border-b border-slate-700/70 pb-2">
          <div>
            <h1 className="text-xl font-semibold">{activeChat?.name ?? 'Chat'}</h1>
            <p className="surface-muted text-xs uppercase tracking-wide">{activeChat?.isGlobal ? 'Globaler Chat' : 'Privater Chat'}</p>
          </div>
          <span className="surface-muted text-xs uppercase tracking-wide">
            {connectionState === 'live' ? statusLabels[sessionStatus] : connectionState === 'connecting' ? 'Verbinden...' : 'Getrennt'}
          </span>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {messages.map((message) => (
            <article key={message.id} className="glass-card rounded-lg px-3 py-2">
              <header className="mb-1 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-accent">{message.userName}</span>
                <time className="text-xs text-slate-400">{formatTime(message.createdAt)}</time>
              </header>
              <p className="break-words text-sm text-slate-100">{message.text}</p>
              {message.attachments?.length ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {message.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <a
                        className="text-cyan-300 underline hover:text-cyan-200"
                        href={`/api/upload/${attachment.id}?sessionId=${encodeURIComponent(sessionId)}&chatId=${encodeURIComponent(activeChatId)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {attachment.fileName} ({Math.ceil(attachment.size / 1024)} KB)
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={sendMessage} className="mt-4 flex gap-2">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={1000}
            placeholder="Nachricht schreiben"
            className="glass-input flex-1 text-sm"
          />
          <button
            type="submit"
            disabled={isSending || !text.trim() || !activeChatId}
            className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            Senden
          </button>
        </form>

        {error ? <p className="alert-error mt-3 rounded-md px-3 py-2 text-sm">{error}</p> : null}
      </section>

      <aside className="glass-panel max-h-[calc(100dvh-10.5rem)] space-y-4 overflow-y-auto rounded-2xl p-4">
        <section>
          <h2 className="surface-muted text-xs font-semibold uppercase tracking-wide">Chats</h2>
          <ul className="mt-2 space-y-2">
            {chats.map((chat) => (
              <li key={chat.id}>
                <button
                  type="button"
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm ${chat.id === activeChatId
                      ? 'border-cyan-300/50 bg-cyan-500/10 text-cyan-100'
                      : 'border-slate-700/80 bg-slate-900/50 text-slate-200 hover:border-slate-600 hover:bg-slate-800/70'
                    }`}
                  onClick={() => {
                    setActiveChatId(chat.id);
                    setMessages([]);
                    void loadContext(chat.id, { silent: true });
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{chat.name}</span>
                    <span className="surface-muted text-xs">{chat.membersCount}</span>
                  </div>
                  <p className="surface-muted mt-1 text-xs">{chat.isGlobal ? 'Global' : 'Custom'}</p>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="surface-muted text-xs font-semibold uppercase tracking-wide">Mitglieder ({members.length})</h2>
          <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto">
            {members.map((member) => (
              <li key={member.id} className="glass-card flex items-center justify-between rounded-md px-2 py-1.5 text-sm">
                <span>{member.name}</span>
                <span className={`h-2 w-2 rounded-full ${member.isOnline ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              </li>
            ))}
            {members.length === 0 ? <li className="surface-muted text-sm">Keine Mitglieder gefunden.</li> : null}
          </ul>
        </section>

        {activeChat && !activeChat.isGlobal ? (
          <section className="space-y-2">
            <h2 className="surface-muted text-xs font-semibold uppercase tracking-wide">Einladen</h2>
            <select
              value={inviteTargetId}
              onChange={(event) => setInviteTargetId(event.target.value)}
              className="glass-input text-sm"
            >
              <option value="">Online User waehlen</option>
              {inviteCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={inviteUser}
              disabled={!inviteTargetId || isInviting}
              className="btn-soft w-full disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isInviting ? 'Lade ein...' : 'Einladen'}
            </button>
          </section>
        ) : null}

        <section className="space-y-2">
          <h2 className="surface-muted text-xs font-semibold uppercase tracking-wide">Neuen Chat erstellen</h2>
          <form onSubmit={createChat} className="space-y-2">
            <input
              value={newChatName}
              onChange={(event) => setNewChatName(event.target.value)}
              maxLength={48}
              className="glass-input text-sm"
              placeholder="Chatname"
            />
            <button
              type="submit"
              disabled={!newChatName.trim() || isCreatingChat}
              className="btn-primary w-full text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreatingChat ? 'Erstelle...' : 'Chat erstellen'}
            </button>
          </form>
        </section>

        <section className="space-y-2">
          <h2 className="surface-muted text-xs font-semibold uppercase tracking-wide">Aktionen</h2>

          <label className="block space-y-2 text-sm">
            <span className="surface-muted">Datei hochladen</span>
            <input type="file" onChange={uploadFile} disabled={isUploading} className="file-input" />
          </label>

          {activeChat && !activeChat.isGlobal && activeChat.canLeave ? (
            <button
              type="button"
              onClick={leaveChat}
              disabled={isLeavingChat}
              className="btn-soft w-full disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLeavingChat ? 'Verlasse Chat...' : 'Chat verlassen'}
            </button>
          ) : null}

          {activeChat && !activeChat.isGlobal && activeChat.canDelete ? (
            <button
              type="button"
              onClick={deactivateChat}
              disabled={isDeletingChat}
              className="w-full rounded-md border border-rose-500/30 bg-rose-500/15 px-4 py-2 text-sm text-rose-100 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeletingChat ? 'Deaktiviere...' : 'Chat deaktivieren'}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('chat_session_id');
              router.push('/');
            }}
            className="btn-soft w-full"
          >
            Komplett ausloggen
          </button>
        </section>
      </aside>
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-xl">
          <section className="glass-panel rounded-2xl p-6">
            <p className="surface-muted text-sm">Chat wird geladen...</p>
          </section>
        </main>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}
