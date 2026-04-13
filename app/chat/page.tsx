
'use client';

import Link from 'next/link';
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import type {
  AppBootstrap,
  AppChatAttachment,
  AppChatContext,
  AppChatGif,
  AppChatMessage,
  AppGroupSettings,
  AppModerationLog,
  AppUserProfile,
  GlobalRole,
  GroupInviteMode,
  GroupInvitePolicy,
  GroupMentionPolicy
} from '@/types/social';

const TOKEN_KEY = 'chat_auth_token';
const SAVED_GIFS_KEY = 'chat_saved_gifs_v1';
const GIF_SAVED_CATEGORY = '__saved__';

function initials(user: Pick<AppUserProfile, 'firstName' | 'lastName' | 'username'>): string {
  const a = user.firstName?.[0] ?? '';
  const b = user.lastName?.[0] ?? '';
  const value = `${a}${b}`.trim();
  return value || user.username.slice(0, 2).toUpperCase();
}

function initialsFromFullName(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return '??';
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return `${first}${last}`.toUpperCase();
}

function avatarUrl(user: Pick<AppUserProfile, 'id' | 'avatarUpdatedAt'>, sessionToken?: string): string {
  const version = user.avatarUpdatedAt ?? 0;
  const tokenQuery = sessionToken ? `&sessionToken=${encodeURIComponent(sessionToken)}` : '';
  return `/api/app/profile/avatar/${encodeURIComponent(user.id)}?v=${version}${tokenQuery}`;
}

function uploadUrl(attachmentId: string, sessionToken?: string): string {
  const tokenQuery = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : '';
  return `/api/app/chats/upload/${encodeURIComponent(attachmentId)}${tokenQuery}`;
}

function isImageAttachment(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

const QUICK_EMOJIS = ['😀', '😂', '😍', '🔥', '👍', '🎉', '❤️', '😎'];

const EMOJI_CATEGORIES: Array<{ key: string; label: string; emojis: string[] }> = [
  {
    key: 'smileys',
    label: 'Smileys',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '🙂', '😉', '😍', '🥰', '😘', '😎', '🤩', '🥳', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😴', '🤤', '🤯', '😡', '😭', '😱', '🥶', '🥵', '🤗']
  },
  {
    key: 'people',
    label: 'Personen',
    emojis: ['👍', '👎', '👏', '🙌', '🤝', '🙏', '💪', '👀', '🫶', '🤟', '✌️', '🤞', '👌', '👋', '🫡', '🤌', '🫠', '🫣', '🫢', '🫥', '👨‍💻', '👩‍💻', '🧑‍💻', '👨‍🎨', '👩‍🎨', '🧑‍🍳', '👨‍🚀', '👩‍🚀', '🧑‍🚀', '🧙', '🧛', '🧜']
  },
  {
    key: 'nature',
    label: 'Natur',
    emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐧', '🐦', '🦄', '🐝', '🦋', '🌸', '🌼', '🌻', '🌹', '🌴', '🌲', '🍀', '🍁', '🌈', '⭐', '🌙', '☀️', '⚡', '🔥']
  },
  {
    key: 'food',
    label: 'Essen',
    emojis: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍓', '🍇', '🍒', '🍍', '🥭', '🍑', '🥑', '🍅', '🥕', '🌽', '🍕', '🍔', '🍟', '🌭', '🍿', '🥨', '🍜', '🍣', '🍱', '🍛', '🍪', '🍩', '🍫', '☕', '🍵']
  },
  {
    key: 'activities',
    label: 'Aktivitaeten',
    emojis: ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🥎', '🎱', '🏓', '🏸', '🥊', '🏆', '🎮', '🕹️', '🎲', '♟️', '🎯', '🎳', '🎸', '🎹', '🥁', '🎷', '🎺', '🎻', '🎤', '🎧', '🎬', '🎨', '🧩', '🚴', '🏊', '🧗']
  },
  {
    key: 'travel',
    label: 'Reisen',
    emojis: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚚', '🚜', '🚲', '🛴', '🏍️', '✈️', '🛫', '🛬', '🚀', '🛸', '⛵', '🚤', '🛥️', '🚢', '🏖️', '🏝️', '🏜️', '🏔️', '🗽', '🗼', '🕌', '🛤️', '🧭']
  },
  {
    key: 'objects',
    label: 'Objekte',
    emojis: ['📱', '💻', '⌚', '🖥️', '🖱️', '⌨️', '🎥', '📷', '📸', '💡', '🔦', '🕯️', '📚', '📖', '🧷', '🧪', '🧬', '🧯', '🪫', '🔋', '⚙️', '🛠️', '🔒', '🔑', '💎', '💰', '💳', '📦', '📎', '✉️', '🧸', '🪩']
  },
  {
    key: 'symbols',
    label: 'Symbole',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '☮️', '✝️', '☪️', '🕉️', '☯️', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐']
  }
];

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isMentioningUser(text: string, username: string): boolean {
  const messageText = text.trim();
  const normalizedUsername = username.trim();
  if (!messageText || !normalizedUsername) {
    return false;
  }
  const mentionRegex = new RegExp(`(^|\\s)@${escapeRegExp(normalizedUsername)}(?=$|\\s|[.,!?;:])`, 'i');
  return mentionRegex.test(messageText);
}

function isMentioningFullName(text: string, fullName: string): boolean {
  const messageText = text.trim();
  const normalized = fullName.trim();
  if (!messageText || !normalized) {
    return false;
  }
  const parts = normalized
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => escapeRegExp(part));
  if (parts.length === 0) {
    return false;
  }
  const mentionRegex = new RegExp(`(^|\\s)@${parts.join('\\s+')}(?=$|\\s|[.,!?;:])`, 'i');
  return mentionRegex.test(messageText);
}

function isSpecialMention(text: string, token: 'everyone' | 'here'): boolean {
  const messageText = text.trim();
  if (!messageText) {
    return false;
  }
  const pattern = token === 'everyone' ? '(?:everyone|everone)' : token;
  const mentionRegex = new RegExp(`(^|\\s)@${pattern}(?=$|\\s|[.,!?;:])`, 'i');
  return mentionRegex.test(messageText);
}

function getFirstTenorUrl(text: string): string | null {
  const match = text.match(/https?:\/\/(?:www\.)?tenor\.com\/[^\s)]+/i);
  return match?.[0]?.trim() ?? null;
}

function removeTenorUrlsFromText(text: string): string {
  return text
    .replace(/https?:\/\/(?:www\.)?tenor\.com\/[^\s)]+/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractLinks(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)]+/gi) ?? [];
  const cleaned = matches
    .map((item) => item.trim().replace(/[),.;!?]+$/, ''))
    .filter((item) => item.length > 0);
  return [...new Set(cleaned)];
}

function getActiveMentionDraft(text: string): { startIndex: number; query: string } | null {
  const match = text.match(/(^|\s)@([^\r\n@]*)$/);
  if (!match) {
    return null;
  }
  const query = match[2] ?? '';
  if (query.endsWith(' ')) {
    return null;
  }
  const marker = `@${query}`;
  const startIndex = text.lastIndexOf(marker);
  if (startIndex < 0) {
    return null;
  }
  return { startIndex, query: query.trimStart() };
}

function roleLabel(role: GlobalRole): string {
  if (role === 'superadmin') return 'superadmin';
  if (role === 'admin') return 'admin';
  return 'user';
}

function roleBadgeClass(role: GlobalRole): string {
  if (role === 'superadmin') return 'role-badge role-badge-super';
  if (role === 'admin') return 'role-badge role-badge-admin';
  return 'role-badge role-badge-user';
}

function groupRoleLabel(role: 'owner' | 'admin' | 'member'): string {
  if (role === 'owner') return 'superadmin';
  if (role === 'admin') return 'admin';
  return 'user';
}

function invitePolicyLabel(policy: GroupInvitePolicy): string {
  if (policy === 'everyone') return 'Jeder';
  if (policy === 'owner') return 'Nur Superadmin';
  return 'Admins + Superadmin';
}

function moderationActionLabel(action: string): string {
  const map: Record<string, string> = {
    member_invited: 'Mitglied eingeladen',
    member_promoted: 'Mitglied befoerdert',
    member_demoted: 'Mitglied herabgestuft',
    member_kicked: 'Mitglied entfernt',
    ownership_transferred: 'Ownership uebertragen',
    settings_updated: 'Gruppeneinstellungen geaendert',
    invite_link_regenerated: 'Invite-Link neu generiert',
    group_closed: 'Gruppe geschlossen',
    message_edited: 'Nachricht bearbeitet',
    message_deleted_for_all: 'Nachricht fuer alle geloescht',
    message_pinned: 'Nachricht angepinnt',
    message_unpinned: 'Nachricht entpinnt'
  };
  return map[action] ?? action.replace(/_/g, ' ');
}

function moderationDetailsLabel(details: Record<string, unknown> | null): string | null {
  if (!details) {
    return null;
  }
  const entries = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim().length > 0)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`);
  return entries.length > 0 ? entries.join(' · ') : null;
}

function Avatar({ user, size = 34, sessionToken }: { user: AppUserProfile; size?: number; sessionToken?: string }) {
  const [failed, setFailed] = useState(false);

  if (!user.avatarUpdatedAt || failed) {
    return (
      <div
        className="flex items-center justify-center rounded-full border border-cyan-300/35 bg-cyan-500/20 text-xs font-semibold text-cyan-100"
        style={{ width: size, height: size }}
      >
        {initials(user)}
      </div>
    );
  }

  return (
    <img
      src={avatarUrl(user, sessionToken)}
      alt={user.username}
      width={size}
      height={size}
      className="rounded-full border border-cyan-300/35 object-cover"
      onError={() => setFailed(true)}
    />
  );
}

async function api(path: string, token: string, init?: RequestInit) {
  const headers = new Headers(init?.headers ?? {});
  headers.set('x-session-token', token);
  if (!headers.has('Content-Type') && init?.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    headers,
    cache: 'no-store'
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json().catch(() => null) : null;
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload ? String(payload.error) : 'Request failed.';
    throw new Error(message);
  }

  return payload;
}

type TenorResult = {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
};

type TenorCategory = {
  searchterm: string;
  name: string;
  image: string;
};

const BUILTIN_GIF_CATEGORIES: TenorCategory[] = [
  { searchterm: 'funny', name: 'Funny', image: '' },
  { searchterm: 'reactions', name: 'Reactions', image: '' },
  { searchterm: 'memes', name: 'Memes', image: '' },
  { searchterm: 'gaming', name: 'Gaming', image: '' },
  { searchterm: 'anime', name: 'Anime', image: '' },
  { searchterm: 'sports', name: 'Sports', image: '' },
  { searchterm: 'animals', name: 'Animals', image: '' },
  { searchterm: 'movies', name: 'Movies', image: '' }
];

type MentionSuggestion = {
  id: string;
  value: string;
  label: string;
  subtitle: string;
  disabled: boolean;
};

type MessageMenuPosition = {
  top: number;
  left: number;
  maxHeight: number;
};

type GroupOverviewTab = 'overview' | 'finder' | 'admin';

function resolveMessageMenuPosition(
  anchorRect: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right'>,
  menuWidth: number,
  menuHeight: number
): MessageMenuPosition {
  const margin = 8;
  const gap = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Default: below + left aligned to trigger (discord-like feel)
  let left = anchorRect.right - menuWidth;
  let top = anchorRect.bottom + gap;

  // If left overflow, try right side first.
  if (left < margin) {
    left = anchorRect.left;
  }
  // Final clamp to viewport.
  left = Math.max(margin, Math.min(left, vw - margin - menuWidth));

  // If it would leave the viewport at the bottom, place it above.
  if (top + menuHeight > vh - margin) {
    const upTop = anchorRect.top - gap - menuHeight;
    if (upTop >= margin) {
      top = upTop;
    } else {
      const belowTop = anchorRect.bottom + gap;
      const spaceBelow = vh - margin - belowTop;
      const spaceAbove = anchorRect.top - gap - margin;
      top = spaceBelow >= spaceAbove ? Math.max(margin, belowTop) : margin;
    }
  }

  top = Math.max(margin, Math.min(top, vh - margin - Math.min(menuHeight, vh - margin * 2)));
  const maxHeight = Math.max(120, vh - margin - top);

  return { top, left, maxHeight };
}

export default function ChatPage() {
  const router = useRouter();

  const [token, setToken] = useState('');
  const [requestedChatId, setRequestedChatId] = useState('');
  const [requestedInviteCode, setRequestedInviteCode] = useState('');
  const [bootstrap, setBootstrap] = useState<AppBootstrap | null>(null);
  const [context, setContext] = useState<AppChatContext | null>(null);
  const [messages, setMessages] = useState<AppChatMessage[]>([]);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(null);
  const [unreadCountAtOpen, setUnreadCountAtOpen] = useState(0);
  const [typingUsers, setTypingUsers] = useState<AppUserProfile[]>([]);
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [discoverUsers, setDiscoverUsers] = useState<AppUserProfile[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showGroupManageModal, setShowGroupManageModal] = useState(false);
  const [groupOverviewTab, setGroupOverviewTab] = useState<GroupOverviewTab>('overview');
  const [finderQuery, setFinderQuery] = useState('');
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [messageSenderFilter, setMessageSenderFilter] = useState('all');
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [moderationLogs, setModerationLogs] = useState<AppModerationLog[]>([]);
  const [groupInviteModeDraft, setGroupInviteModeDraft] = useState<GroupInviteMode>('direct');
  const [groupInvitePolicyDraft, setGroupInvitePolicyDraft] = useState<GroupInvitePolicy>('admins');
  const [groupEveryoneMentionPolicyDraft, setGroupEveryoneMentionPolicyDraft] = useState<GroupMentionPolicy>('admins');
  const [groupHereMentionPolicyDraft, setGroupHereMentionPolicyDraft] = useState<GroupMentionPolicy>('admins');
  const [groupAutoHide24hDraft, setGroupAutoHide24hDraft] = useState(false);
  const [ownershipTargetUserId, setOwnershipTargetUserId] = useState('');
  const [groupInviteCodeInput, setGroupInviteCodeInput] = useState('');
  const [text, setText] = useState('');
  const [composerFocused, setComposerFocused] = useState(false);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [pendingAttachments, setPendingAttachments] = useState<AppChatAttachment[]>([]);
  const [selectedGif, setSelectedGif] = useState<AppChatGif | null>(null);
  const [showGifModal, setShowGifModal] = useState(false);
  const [gifQuery, setGifQuery] = useState('');
  const [gifResults, setGifResults] = useState<TenorResult[]>([]);
  const [gifNextCursor, setGifNextCursor] = useState<string | null>(null);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifCategories, setGifCategories] = useState<TenorCategory[]>([]);
  const [savedGifResults, setSavedGifResults] = useState<TenorResult[]>([]);
  const [activeGifCategory, setActiveGifCategory] = useState('');
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState(EMOJI_CATEGORIES[0].key);
  const [emojiTargetMessageId, setEmojiTargetMessageId] = useState<string | null>(null);
  const [actionMenuMessageId, setActionMenuMessageId] = useState<string | null>(null);
  const [actionMenuAnchorElement, setActionMenuAnchorElement] = useState<HTMLElement | null>(null);
  const [actionMenuPosition, setActionMenuPosition] = useState<MessageMenuPosition | null>(null);
  const [replyTarget, setReplyTarget] = useState<AppChatMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppChatMessage | null>(null);
  const [profileCard, setProfileCard] = useState<AppUserProfile | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [showMentionNotificationPrompt, setShowMentionNotificationPrompt] = useState(false);
  const [isResolvingTenorLink, setIsResolvingTenorLink] = useState(false);
  const [resolvedTenorDraftUrl, setResolvedTenorDraftUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const firstUnreadRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingActiveRef = useRef(false);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mentionAudioRef = useRef<AudioContext | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  const activeChatId = bootstrap?.activeChatId ?? null;
  const chats = bootstrap?.chats ?? [];
  const me = bootstrap?.me ?? null;
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  const activeChatName = activeChat?.name ?? context?.chat.name ?? 'Chat';
  const members = context?.members ?? [];
  const onlineMembersCount = members.filter((member) => member.isOnline).length;
  const groupSettings = context?.groupSettings ?? null;
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  const discoverCandidates = useMemo(
    () => discoverUsers.filter((user) => !members.some((member) => member.user.id === user.id)),
    [discoverUsers, members]
  );
  const visibleGifCategories = useMemo(() => {
    const merged = [...BUILTIN_GIF_CATEGORIES, ...gifCategories];
    const seen = new Set<string>();
    return merged.filter((category) => {
      const key = category.searchterm.trim().toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [gifCategories]);
  const firstTenorUrlInDraft = useMemo(() => getFirstTenorUrl(text), [text]);
  const mentionDraft = useMemo(() => getActiveMentionDraft(text), [text]);
  const mentionSuggestions = useMemo<MentionSuggestion[]>(() => {
    if (!mentionDraft || !context || !me) {
      return [];
    }
    const query = mentionDraft.query.toLowerCase();
    const out: MentionSuggestion[] = [];

    if (context.chat.kind === 'group') {
      const canUseEveryone = groupSettings?.canUseEveryoneMention === true;
      const canUseHere = groupSettings?.canUseHereMention === true;
      const includeEveryone = query.length === 0 || 'everyone'.includes(query) || 'everone'.includes(query);
      const includeHere = query.length === 0 || 'here'.includes(query);

      if (includeEveryone) {
        out.push({
          id: 'special-everyone',
          value: 'everyone',
          label: '@everyone',
          subtitle: canUseEveryone ? 'Alle in der Gruppe pingen' : 'Nicht erlaubt durch Gruppen-Policy',
          disabled: !canUseEveryone
        });
      }
      if (includeHere) {
        out.push({
          id: 'special-here',
          value: 'here',
          label: '@here',
          subtitle: canUseHere ? 'Nur online Mitglieder pingen' : 'Nicht erlaubt durch Gruppen-Policy',
          disabled: !canUseHere
        });
      }
    }

    const userSuggestions = members
      .filter((member) => member.user.id !== me.id)
      .filter((member) => {
        if (!query) {
          return true;
        }
        const username = member.user.username.toLowerCase();
        const fullName = member.user.fullName.toLowerCase();
        return username.includes(query) || fullName.includes(query);
      })
      .sort((a, b) => Number(b.isOnline) - Number(a.isOnline) || a.user.fullName.localeCompare(b.user.fullName))
      .map<MentionSuggestion>((member) => ({
        id: `user-${member.user.id}`,
        value: member.user.fullName.trim() || member.user.username,
        label: member.user.fullName,
        subtitle: `@${member.user.username}${member.isOnline ? ' · online' : ''}`,
        disabled: false
      }));

    return [...out, ...userSuggestions].slice(0, 14);
  }, [context, groupSettings?.canUseEveryoneMention, groupSettings?.canUseHereMention, me, members, mentionDraft]);
  const mentionMenuVisible = composerFocused && Boolean(mentionDraft) && mentionSuggestions.length > 0;
  const activeMentionSuggestion = mentionMenuVisible ? mentionSuggestions[mentionActiveIndex] : null;
  const groupLinks = useMemo(() => {
    return messages
      .flatMap((message) =>
        extractLinks(message.text).map((url) => ({
          url,
          messageId: message.id,
          author: message.user.fullName,
          createdAt: message.createdAt
        }))
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [messages]);
  const groupImages = useMemo(() => {
    return messages
      .flatMap((message) =>
        message.attachments
          .filter((attachment) => isImageAttachment(attachment.mimeType))
          .map((attachment) => ({
            attachment,
            messageId: message.id,
            author: message.user.fullName,
            createdAt: message.createdAt
          }))
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [messages]);
  const groupFiles = useMemo(() => {
    return messages
      .flatMap((message) =>
        message.attachments
          .filter((attachment) => !isImageAttachment(attachment.mimeType))
          .map((attachment) => ({
            attachment,
            messageId: message.id,
            author: message.user.fullName,
            createdAt: message.createdAt
          }))
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [messages]);
  const normalizedFinderQuery = finderQuery.trim().toLowerCase();
  const visibleLinks = useMemo(() => {
    if (!normalizedFinderQuery) {
      return groupLinks;
    }
    return groupLinks.filter(
      (item) =>
        item.url.toLowerCase().includes(normalizedFinderQuery) || item.author.toLowerCase().includes(normalizedFinderQuery)
    );
  }, [groupLinks, normalizedFinderQuery]);
  const visibleImages = useMemo(() => {
    if (!normalizedFinderQuery) {
      return groupImages;
    }
    return groupImages.filter(
      (item) =>
        item.attachment.fileName.toLowerCase().includes(normalizedFinderQuery) || item.author.toLowerCase().includes(normalizedFinderQuery)
    );
  }, [groupImages, normalizedFinderQuery]);
  const visibleFiles = useMemo(() => {
    if (!normalizedFinderQuery) {
      return groupFiles;
    }
    return groupFiles.filter(
      (item) =>
        item.attachment.fileName.toLowerCase().includes(normalizedFinderQuery) || item.author.toLowerCase().includes(normalizedFinderQuery)
    );
  }, [groupFiles, normalizedFinderQuery]);
  const normalizedMessageSearchQuery = messageSearchQuery.trim().toLowerCase();
  const pinnedMessages = useMemo(
    () => messages.filter((message) => message.isPinned).sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)),
    [messages]
  );
  const filteredMessages = useMemo(() => {
    return messages.filter((message) => {
      if (showPinnedOnly && !message.isPinned) {
        return false;
      }
      if (messageSenderFilter !== 'all' && message.user.id !== messageSenderFilter) {
        return false;
      }
      if (!normalizedMessageSearchQuery) {
        return true;
      }
      const haystack = `${message.text} ${message.user.fullName} ${message.user.username} ${message.attachments.map((item) => item.fileName).join(' ')}`.toLowerCase();
      return haystack.includes(normalizedMessageSearchQuery);
    });
  }, [messages, messageSearchQuery, messageSenderFilter, showPinnedOnly, normalizedMessageSearchQuery]);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY) ?? '';
    if (!stored) {
      router.replace('/');
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const queryChatId = params.get('chatId')?.trim() ?? '';
    const queryInviteCode = params.get('inviteCode')?.trim() ?? '';
    setRequestedChatId(queryChatId);
    setRequestedInviteCode(queryInviteCode);
    setToken(stored);
  }, [router]);

  useEffect(() => {
    document.body.classList.add('chat-no-scroll');
    return () => {
      document.body.classList.remove('chat-no-scroll');
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setShowMentionNotificationPrompt(false);
      return;
    }

    const permission = Notification.permission;
    setNotificationPermission(permission);
    const dismissed = localStorage.getItem('chat_mentions_notification_prompt_dismissed') === '1';
    setShowMentionNotificationPrompt(permission === 'default' && !dismissed);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const raw = localStorage.getItem(SAVED_GIFS_KEY) ?? '[]';
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setSavedGifResults([]);
        return;
      }
      const safe = parsed
        .filter(
          (item): item is TenorResult =>
            Boolean(
              item &&
                typeof item === 'object' &&
                typeof (item as TenorResult).id === 'string' &&
                typeof (item as TenorResult).url === 'string'
            )
        )
        .slice(0, 80);
      setSavedGifResults(safe);
    } catch {
      setSavedGifResults([]);
    }
  }, []);

  const loadBootstrap = async (currentToken: string, chatId?: string) => {
    const query = chatId ? `?chatId=${encodeURIComponent(chatId)}` : '';
    const payload = (await api(`/api/app/bootstrap${query}`, currentToken)) as AppBootstrap;
    setBootstrap(payload);
    if (!payload.activeChatId) {
      setContext(null);
      setMessages([]);
      setTypingUsers([]);
      setFirstUnreadMessageId(null);
      setUnreadCountAtOpen(0);
    }
    return payload;
  };

  const loadContext = async (currentToken: string, chatId: string) => {
    const payload = (await api(`/api/app/chats/context?chatId=${encodeURIComponent(chatId)}`, currentToken)) as {
      context: AppChatContext;
    };
    setContext(payload.context);
    setMessages(payload.context.messages);
    setFirstUnreadMessageId(payload.context.firstUnreadMessageId);
    setUnreadCountAtOpen(payload.context.unreadCountAtOpen);
    setTypingUsers([]);
  };

  const setTypingState = async (isTyping: boolean, chatIdOverride?: string): Promise<void> => {
    const chatId = chatIdOverride ?? activeChatId;
    if (!token || !chatId) {
      return;
    }

    try {
      await api('/api/app/chats/typing', token, {
        method: 'POST',
        body: JSON.stringify({ chatId, isTyping })
      });
    } catch {
      // best effort typing signal
    }
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    const runBootstrap = async () => {
      let initialChatId = requestedChatId || undefined;
      if (requestedInviteCode) {
        try {
          const joinPayload = (await api('/api/app/chats/group/join', token, {
            method: 'POST',
            body: JSON.stringify({ inviteCode: requestedInviteCode })
          })) as { chat: { id: string } };
          initialChatId = joinPayload.chat.id;
          if (!cancelled) {
            setRequestedInviteCode('');
          }
        } catch (joinError) {
          if (!cancelled) {
            setRequestedInviteCode('');
            setError(joinError instanceof Error ? joinError.message : 'Invite-Link ist ungueltig.');
          }
        }
      }
      try {
        const payload = await loadBootstrap(token, initialChatId);
        if (cancelled) {
          return;
        }

        const nextChatId = payload.activeChatId;
        if (nextChatId) {
          await loadContext(token, nextChatId);
          await loadBootstrap(token, nextChatId);
        }
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        router.replace('/');
      }
    };

    void runBootstrap();

    return () => {
      cancelled = true;
    };
  }, [token, router, requestedChatId, requestedInviteCode]);

  useEffect(() => {
    if (!token || !activeChatId) {
      return;
    }

    let closed = false;
    const streamChatId = activeChatId;
    const myUserId = me?.id ?? '';
    const myUsername = me?.username ?? '';
    const myFullName = me?.fullName ?? '';
    const streamChatName = activeChatName;
    const stream = new EventSource(
      `/api/app/chats/stream?chatId=${encodeURIComponent(streamChatId)}&sessionToken=${encodeURIComponent(token)}&t=${Date.now()}`,
      {
        withCredentials: true
      }
    );

    stream.addEventListener('history', (event) => {
      if (closed) return;
      const payload = JSON.parse((event as MessageEvent).data) as { messages: AppChatMessage[] };
      setMessages(payload.messages);
    });

    stream.addEventListener('message', (event) => {
      if (closed) return;
      const payload = JSON.parse((event as MessageEvent).data) as { message: AppChatMessage };
      setMessages((prev) => [...prev, payload.message]);
      const message = payload.message;
      const mentionsMe =
        message.user.id !== myUserId &&
        !message.deletedForAll &&
        (
          message.mentionedMe ||
          isMentioningUser(message.text, myUsername) ||
          isMentioningFullName(message.text, myFullName) ||
          isSpecialMention(message.text, 'everyone') ||
          isSpecialMention(message.text, 'here')
        );
      if (mentionsMe) {
        pushMentionNotification(message, streamChatName);
      }
    });

    stream.addEventListener('message_update', (event) => {
      if (closed) return;
      const payload = JSON.parse((event as MessageEvent).data) as { message: AppChatMessage };
      patchMessage(payload.message);
    });

    stream.addEventListener('typing', (event) => {
      if (closed) return;
      const payload = JSON.parse((event as MessageEvent).data) as { users?: AppUserProfile[] };
      const users = Array.isArray(payload.users) ? payload.users : [];
      setTypingUsers(users);
    });

    stream.addEventListener('session', () => {
      if (closed) return;
      localStorage.removeItem(TOKEN_KEY);
      router.replace('/');
    });

    stream.addEventListener('chat', () => {
      if (closed) return;
      void loadBootstrap(token, streamChatId);
    });

    stream.onerror = () => {
      if (closed) return;
      setError('Live-Verbindung unterbrochen.');
    };

    return () => {
      closed = true;
      stream.close();
      if (typingActiveRef.current) {
        void setTypingState(false, streamChatId);
      }
      if (typingIdleTimerRef.current) {
        clearTimeout(typingIdleTimerRef.current);
        typingIdleTimerRef.current = null;
      }
      typingActiveRef.current = false;
      setTypingUsers([]);
    };
  }, [activeChatId, router, token, me?.id, me?.username, me?.fullName, activeChatName, notificationPermission]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setShowGroupManageModal(false);
  }, [activeChatId]);

  useEffect(() => {
    setMentionActiveIndex(0);
  }, [mentionDraft?.query, activeChatId]);

  useEffect(() => {
    if (!mentionMenuVisible) {
      return;
    }
    setMentionActiveIndex((prev) => Math.max(0, Math.min(prev, mentionSuggestions.length - 1)));
  }, [mentionMenuVisible, mentionSuggestions.length]);

  useEffect(() => {
    if (!showGroupManageModal || groupOverviewTab !== 'admin') {
      return;
    }
    void loadModerationLogs();
  }, [showGroupManageModal, groupOverviewTab, activeChatId, token]);

  useEffect(() => {
    if (!actionMenuMessageId || !actionMenuAnchorElement || !actionMenuRef.current) {
      return;
    }
    const anchorRect = actionMenuAnchorElement.getBoundingClientRect();
    const menuRect = actionMenuRef.current.getBoundingClientRect();
    const next = resolveMessageMenuPosition(anchorRect, menuRect.width, menuRect.height);
    setActionMenuPosition((prev) =>
      prev && prev.top === next.top && prev.left === next.left && prev.maxHeight === next.maxHeight ? prev : next
    );
  }, [actionMenuMessageId, actionMenuAnchorElement]);

  useEffect(() => {
    if (actionMenuMessageId !== null) {
      return;
    }
    setActionMenuAnchorElement(null);
    setActionMenuPosition(null);
  }, [actionMenuMessageId]);

  useEffect(() => {
    if (!actionMenuMessageId) {
      return;
    }
    const onViewportChange = () => {
      setActionMenuMessageId(null);
      setActionMenuAnchorElement(null);
    };
    window.addEventListener('resize', onViewportChange);
    document.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      document.removeEventListener('scroll', onViewportChange, true);
    };
  }, [actionMenuMessageId]);

  useEffect(() => {
    if (!actionMenuMessageId) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (actionMenuRef.current?.contains(target)) {
        return;
      }
      if (actionMenuAnchorElement?.contains(target)) {
        return;
      }
      setActionMenuMessageId(null);
      setActionMenuAnchorElement(null);
      setActionMenuPosition(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [actionMenuMessageId, actionMenuAnchorElement]);

  useEffect(() => {
    if (!token) {
      return;
    }

    void api(`/api/app/users?q=${encodeURIComponent(discoverQuery)}`, token)
      .then((payload) => {
        const users = Array.isArray((payload as { users?: AppUserProfile[] }).users)
          ? (payload as { users: AppUserProfile[] }).users
          : [];
        setDiscoverUsers(users);
      })
      .catch(() => {
        setDiscoverUsers([]);
      });
  }, [discoverQuery, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const refreshTimer = setInterval(() => {
      void loadBootstrap(token, activeChatId ?? undefined);
      if (activeChatId) {
        void loadContext(token, activeChatId);
      }
    }, 7_000);

    return () => {
      clearInterval(refreshTimer);
    };
  }, [activeChatId, token]);

  useEffect(() => {
    if (!showGroupModal && !showGroupManageModal && !showGifModal && !showPollModal && !showEmojiPanel) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowGroupModal(false);
        setShowGroupManageModal(false);
        setShowGifModal(false);
        setShowPollModal(false);
        setShowEmojiPanel(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showGroupModal, showGroupManageModal, showGifModal, showPollModal, showEmojiPanel]);

  const fetchGifPage = async (cursor: string | null, append: boolean) => {
    if (!token || !showGifModal) {
      return;
    }
    const query = gifQuery.trim();
    if (!query && activeGifCategory === GIF_SAVED_CATEGORY) {
      setGifNextCursor(null);
      setGifResults(savedGifResults);
      return;
    }
    const categoryQuery = !query && activeGifCategory ? activeGifCategory : '';
    const effectiveQuery = query || categoryQuery;
    const params = new URLSearchParams();
    params.set('limit', effectiveQuery ? '50' : '48');
    if (effectiveQuery) {
      params.set('q', effectiveQuery);
    }
    if (cursor) {
      params.set('pos', cursor);
    }
    const path = effectiveQuery
      ? `/api/app/tenor/search?${params.toString()}`
      : `/api/app/tenor/trending?${params.toString()}`;

    setGifLoading(true);
    try {
      const payload = (await api(path, token)) as { results?: TenorResult[]; next?: string | null };
      const results = Array.isArray(payload.results) ? payload.results : [];
      setGifResults((prev) => {
        if (!append) {
          return results;
        }
        const merged = [...prev, ...results];
        const seen = new Set<string>();
        return merged.filter((item) => {
          if (!item.id || seen.has(item.id)) {
            return false;
          }
          seen.add(item.id);
          return true;
        });
      });
      const next = typeof payload.next === 'string' && payload.next.trim() ? payload.next.trim() : null;
      setGifNextCursor(next);
    } catch {
      if (!append) {
        setGifResults([]);
      }
      setGifNextCursor(null);
    } finally {
      setGifLoading(false);
    }
  };

  useEffect(() => {
    if (!token || !showGifModal) {
      return;
    }
    setGifNextCursor(null);
    const query = gifQuery.trim();
    const timer = setTimeout(() => {
      void fetchGifPage(null, false);
    }, query ? 220 : 0);
    return () => clearTimeout(timer);
  }, [activeGifCategory, gifQuery, savedGifResults, showGifModal, token]);

  useEffect(() => {
    if (!token || !showGifModal) {
      return;
    }
    void api('/api/app/tenor/categories', token)
      .then((payload) => {
        const tags = Array.isArray((payload as { tags?: TenorCategory[] }).tags)
          ? ((payload as { tags: TenorCategory[] }).tags ?? [])
          : [];
        setGifCategories(tags);
      })
      .catch(() => {
        setGifCategories([]);
      });
  }, [showGifModal, token]);

  useEffect(() => {
    if (!token || editingMessageId || selectedGif || !firstTenorUrlInDraft) {
      if (!firstTenorUrlInDraft) {
        setResolvedTenorDraftUrl('');
        setIsResolvingTenorLink(false);
      }
      return;
    }
    if (resolvedTenorDraftUrl === firstTenorUrlInDraft) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setIsResolvingTenorLink(true);
      void api(`/api/app/tenor/resolve?url=${encodeURIComponent(firstTenorUrlInDraft)}`, token)
        .then((payload) => {
          if (cancelled) {
            return;
          }
          const gif = (payload as { gif?: AppChatGif | null }).gif;
          if (gif?.url) {
            setSelectedGif(gif);
            setText((prev) => removeTenorUrlsFromText(prev));
          }
          setResolvedTenorDraftUrl(firstTenorUrlInDraft);
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          setResolvedTenorDraftUrl(firstTenorUrlInDraft);
        })
        .finally(() => {
          if (!cancelled) {
            setIsResolvingTenorLink(false);
          }
        });
    }, 240);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [editingMessageId, firstTenorUrlInDraft, resolvedTenorDraftUrl, selectedGif, token]);

  const selectChat = async (chatId: string) => {
    if (!token || !chatId) return;
    setError(null);
    setInfo(null);

    if (typingIdleTimerRef.current) {
      clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      void setTypingState(false);
    }
    setTypingUsers([]);
    setPendingAttachments([]);
    setSelectedGif(null);
    setPollQuestion('');
    setPollOptions(['', '']);
    setShowEmojiPanel(false);
    setEmojiTargetMessageId(null);
    setActionMenuMessageId(null);
    setReplyTarget(null);
    setEditingMessageId(null);

    try {
      const next = await loadBootstrap(token, chatId);
      router.replace(`/chat?chatId=${encodeURIComponent(chatId)}`);
      if (next.activeChatId) {
        await loadContext(token, next.activeChatId);
        await loadBootstrap(token, next.activeChatId);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Chat konnte nicht geladen werden.');
    }
  };

  const jumpToFirstUnread = () => {
    if (!firstUnreadRef.current) {
      return;
    }

    firstUnreadRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  };

  const jumpToMessageFromModeration = (messageId: string) => {
    setShowGroupManageModal(false);
    window.setTimeout(() => {
      const target = document.getElementById(`chat-msg-${messageId}`);
      target?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }, 120);
  };

  const patchMessage = (next: AppChatMessage) => {
    setMessages((prev) => prev.map((item) => (item.id === next.id ? next : item)));
  };

  const uploadAttachment = async (file: File | null) => {
    if (!token || !activeChatId || !file) {
      return;
    }

    const formData = new FormData();
    formData.set('chatId', activeChatId);
    formData.set('file', file);

    setIsUploading(true);
    setError(null);
    try {
      const payload = (await api('/api/app/chats/upload', token, {
        method: 'POST',
        body: formData
      })) as { attachment: AppChatAttachment };
      setPendingAttachments((prev) => [...prev, payload.attachment]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Upload fehlgeschlagen.');
    } finally {
      setIsUploading(false);
    }
  };

  const removePendingAttachment = (attachmentId: string) => {
    setPendingAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
  };

  const addEmoji = (emoji: string) => {
    if (emojiTargetMessageId) {
      void reactToMessage(emojiTargetMessageId, emoji);
      setEmojiTargetMessageId(null);
      setShowEmojiPanel(false);
      setActionMenuMessageId(null);
      return;
    }
    const next = `${text}${emoji}`;
    handleComposerChange(next);
    setShowEmojiPanel(false);
  };

  const applyMentionSuggestion = (value: string) => {
    const draft = getActiveMentionDraft(text);
    const next = draft
      ? `${text.slice(0, draft.startIndex)}@${value} `
      : `${text}${text && !/\s$/.test(text) ? ' ' : ''}@${value} `;
    handleComposerChange(next);
    setMentionActiveIndex(0);
  };

  const appendMentionToken = (tokenValue: '@everyone' | '@here') => {
    applyMentionSuggestion(tokenValue.slice(1));
  };

  const applyPollFromModal = () => {
    const question = pollQuestion.trim();
    const options = [...new Set(pollOptions.map((item) => item.trim()).filter((item) => item.length > 0))];
    if (!question || options.length < 2) {
      setError('Bitte Frage und mindestens 2 Optionen angeben.');
      return;
    }
    setPollQuestion(question);
    setPollOptions(options);
    setShowPollModal(false);
  };

  const clearPoll = () => {
    setPollQuestion('');
    setPollOptions(['', '']);
  };

  const selectGif = (gif: TenorResult) => {
    setSelectedGif({
      url: gif.url,
      previewUrl: gif.previewUrl,
      tenorId: gif.id,
      title: gif.title
    });
    setSavedGifResults((prev) => {
      const merged = [gif, ...prev.filter((item) => item.id !== gif.id)].slice(0, 80);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(SAVED_GIFS_KEY, JSON.stringify(merged));
        } catch {
          // ignore storage write failures
        }
      }
      return merged;
    });
    setShowGifModal(false);
  };

  const loadMoreGifs = () => {
    if (!gifNextCursor || gifLoading) {
      return;
    }
    void fetchGifPage(gifNextCursor, true);
  };

  const votePoll = async (messageId: string, optionId: string) => {
    if (!token || !activeChatId) {
      return;
    }
    try {
      const payload = (await api('/api/app/chats/poll/vote', token, {
        method: 'POST',
        body: JSON.stringify({ chatId: activeChatId, messageId, optionId })
      })) as { message: AppChatMessage };
      patchMessage(payload.message);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Vote fehlgeschlagen.');
    }
  };

  const reactToMessage = async (messageId: string, emoji: string) => {
    if (!token || !activeChatId) {
      return;
    }
    try {
      const payload = (await api('/api/app/chats/reaction', token, {
        method: 'POST',
        body: JSON.stringify({ chatId: activeChatId, messageId, emoji })
      })) as { message: AppChatMessage };
      patchMessage(payload.message);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Reaction fehlgeschlagen.');
    }
  };

  const canDeleteForAll = (message: AppChatMessage): boolean => {
    if (!me) {
      return false;
    }
    if (message.user.id === me.id) {
      return true;
    }
    if (me.role === 'superadmin') {
      return true;
    }
    return context?.chat.kind === 'group' && context.chat.memberRole === 'owner';
  };

  const canPinMessage = (): boolean => {
    if (!me) {
      return false;
    }
    if (me.role === 'superadmin') {
      return true;
    }
    if (context?.chat.kind !== 'group') {
      return false;
    }
    return context.chat.memberRole === 'owner' || context.chat.memberRole === 'admin';
  };

  const togglePinMessage = async (messageId: string) => {
    if (!token || !activeChatId || !canPinMessage()) {
      return;
    }
    try {
      const payload = (await api('/api/app/chats/pin', token, {
        method: 'POST',
        body: JSON.stringify({ chatId: activeChatId, messageId })
      })) as { message: AppChatMessage };
      patchMessage(payload.message);
      setActionMenuMessageId(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Pin fehlgeschlagen.');
    }
  };

  const openMenuForMessage = (messageId: string, triggerElement: HTMLElement) => {
    setActionMenuMessageId((prev) => {
      const nextIsOpen = prev !== messageId;
      if (!nextIsOpen) {
        setActionMenuAnchorElement(null);
        setActionMenuPosition(null);
        return null;
      }
      const rect = triggerElement.getBoundingClientRect();
      setActionMenuAnchorElement(triggerElement);
      setActionMenuPosition(resolveMessageMenuPosition(rect, Math.min(288, Math.floor(window.innerWidth * 0.72)), 250));
      return messageId;
    });
  };

  const replyToMessage = (message: AppChatMessage) => {
    setReplyTarget(message);
    setEditingMessageId(null);
    setActionMenuMessageId(null);
  };

  const startEditMessage = (message: AppChatMessage) => {
    setEditingMessageId(message.id);
    setReplyTarget(null);
    setPendingAttachments([]);
    setSelectedGif(null);
    clearPoll();
    setText(message.text);
    setActionMenuMessageId(null);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setText('');
  };

  const openDeleteModal = (message: AppChatMessage) => {
    setDeleteTarget(message);
    setActionMenuMessageId(null);
  };

  const deleteMessage = async (scope: 'me' | 'all') => {
    if (!token || !activeChatId || !deleteTarget) {
      return;
    }
    try {
      const payload = (await api('/api/app/chats/message/delete', token, {
        method: 'POST',
        body: JSON.stringify({ chatId: activeChatId, messageId: deleteTarget.id, scope })
      })) as { removedForMe: boolean; message: AppChatMessage | null };

      if (payload.removedForMe || !payload.message) {
        setMessages((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      } else {
        patchMessage(payload.message);
      }
      if (replyTarget?.id === deleteTarget.id) {
        setReplyTarget(null);
      }
      if (editingMessageId === deleteTarget.id) {
        cancelEdit();
      }
      setDeleteTarget(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Loeschen fehlgeschlagen.');
    }
  };

  const handleComposerChange = (nextValue: string) => {
    setText(nextValue);

    if (!token || !activeChatId) {
      return;
    }

    const hasText = nextValue.trim().length > 0;
    if (!hasText) {
      if (typingIdleTimerRef.current) {
        clearTimeout(typingIdleTimerRef.current);
        typingIdleTimerRef.current = null;
      }
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        void setTypingState(false);
      }
      return;
    }

    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      void setTypingState(true);
    }

    if (typingIdleTimerRef.current) {
      clearTimeout(typingIdleTimerRef.current);
    }

    typingIdleTimerRef.current = setTimeout(() => {
      typingIdleTimerRef.current = null;
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        void setTypingState(false);
      }
    }, 1500);
  };

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!mentionMenuVisible || mentionSuggestions.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setMentionActiveIndex((prev) => (prev + 1) % mentionSuggestions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setMentionActiveIndex((prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
      return;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      const selected = mentionSuggestions[Math.max(0, mentionActiveIndex)] ?? mentionSuggestions[0];
      if (!selected || selected.disabled) {
        return;
      }
      applyMentionSuggestion(selected.value);
    }
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !activeChatId) return;
    const trimmed = text.trim();
    if (editingMessageId) {
      if (!trimmed) {
        return;
      }
      setError(null);
      try {
        const payload = (await api('/api/app/chats/message/edit', token, {
          method: 'POST',
          body: JSON.stringify({
            chatId: activeChatId,
            messageId: editingMessageId,
            text: trimmed
          })
        })) as { message: AppChatMessage };
        patchMessage(payload.message);
        cancelEdit();
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Bearbeiten fehlgeschlagen.');
      }
      return;
    }

    const hasPoll = pollQuestion.trim().length > 0 && pollOptions.filter((item) => item.trim().length > 0).length >= 2;
    const hasGif = Boolean(selectedGif?.url);
    const textForSend = hasGif ? removeTenorUrlsFromText(trimmed) : trimmed;
    const hasAttachments = pendingAttachments.length > 0;
    if (!textForSend && !hasPoll && !hasGif && !hasAttachments) return;

    setError(null);
    try {
      await api('/api/app/chats/message', token, {
        method: 'POST',
        body: JSON.stringify({
          chatId: activeChatId,
          text: textForSend,
          attachmentIds: pendingAttachments.map((item) => item.id),
          replyToMessageId: replyTarget?.id ?? null,
          gif: hasGif ? selectedGif : null,
          poll: hasPoll
            ? {
                question: pollQuestion.trim(),
                options: pollOptions.map((item) => item.trim()).filter((item) => item.length > 0)
              }
            : null
        })
      });
      setText('');
      setResolvedTenorDraftUrl('');
      setPendingAttachments([]);
      setSelectedGif(null);
      clearPoll();
      setReplyTarget(null);
      setShowEmojiPanel(false);
      if (typingIdleTimerRef.current) {
        clearTimeout(typingIdleTimerRef.current);
        typingIdleTimerRef.current = null;
      }
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        void setTypingState(false);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Nachricht fehlgeschlagen.');
    }
  };

  const createGroup = async () => {
    if (!token || !groupName.trim()) return;
    setIsBusy(true);
    setError(null);

    try {
      const payload = (await api('/api/app/chats/group', token, {
        method: 'POST',
        body: JSON.stringify({ name: groupName, memberIds: groupMemberIds })
      })) as { chat: { id: string } };

      setGroupName('');
      setGroupMemberIds([]);
      setShowGroupModal(false);
      await selectChat(payload.chat.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Gruppe fehlgeschlagen.');
    } finally {
      setIsBusy(false);
    }
  };

  const toggleGroupMember = (userId: string) => {
    setGroupMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const startDirect = async (targetUserId: string) => {
    if (!token) return;

    try {
      const payload = (await api('/api/app/chats/direct', token, {
        method: 'POST',
        body: JSON.stringify({ targetUserId })
      })) as { chat: { id: string } };
      await selectChat(payload.chat.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'DM fehlgeschlagen.');
    }
  };

  const sendFriendRequest = async (targetUserId: string) => {
    if (!token) return;

    try {
      await api('/api/app/friends/request', token, {
        method: 'POST',
        body: JSON.stringify({ targetUserId })
      });
      await loadBootstrap(token, activeChatId ?? undefined);
      setInfo('Freundschaftsanfrage gesendet.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Freundschaftsanfrage fehlgeschlagen.');
    }
  };

  const manageMember = async (targetUserId: string, action: 'invite' | 'promote' | 'demote' | 'kick' | 'transfer_ownership') => {
    if (!token || !activeChatId) return;

    try {
      await api('/api/app/chats/member', token, {
        method: 'POST',
        body: JSON.stringify({ chatId: activeChatId, targetUserId, action })
      });
      await loadContext(token, activeChatId);
      await loadBootstrap(token, activeChatId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Mitgliederaktion fehlgeschlagen.');
    }
  };

  const openGroupManagementModal = () => {
    if (!groupSettings || !context || context.chat.kind !== 'group') {
      return;
    }
    setGroupInviteModeDraft(groupSettings.inviteMode);
    setGroupInvitePolicyDraft(groupSettings.invitePolicy);
    setGroupEveryoneMentionPolicyDraft(groupSettings.everyoneMentionPolicy);
    setGroupHereMentionPolicyDraft(groupSettings.hereMentionPolicy);
    setGroupAutoHide24hDraft(groupSettings.autoHideAfter24h);
    setOwnershipTargetUserId('');
    setFinderQuery('');
    setGroupOverviewTab('overview');
    setShowGroupManageModal(true);
    void loadModerationLogs();
  };

  const loadModerationLogs = async () => {
    if (!token || !activeChatId) {
      return;
    }
    try {
      const payload = (await api(`/api/app/chats/moderation?chatId=${encodeURIComponent(activeChatId)}&limit=120`, token)) as {
        logs: AppModerationLog[];
      };
      setModerationLogs(payload.logs);
    } catch {
      setModerationLogs([]);
    }
  };

  const saveGroupSettings = async () => {
    if (!token || !activeChatId || !groupSettings?.canManageSettings) {
      return;
    }
    setIsBusy(true);
    setError(null);
    setInfo(null);

    try {
      await api('/api/app/chats/group/settings', token, {
        method: 'POST',
        body: JSON.stringify({
          chatId: activeChatId,
          action: 'update',
          inviteMode: groupInviteModeDraft,
          invitePolicy: groupInvitePolicyDraft,
          everyoneMentionPolicy: groupEveryoneMentionPolicyDraft,
          hereMentionPolicy: groupHereMentionPolicyDraft,
          autoHideAfter24h: groupAutoHide24hDraft
        })
      });
      await loadContext(token, activeChatId);
      await loadBootstrap(token, activeChatId);
      setInfo('Gruppen-Einstellungen aktualisiert.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Gruppen-Einstellungen fehlgeschlagen.');
    } finally {
      setIsBusy(false);
    }
  };

  const regenerateInviteLink = async () => {
    if (!token || !activeChatId || !groupSettings?.canManageSettings) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setInfo(null);
    try {
      await api('/api/app/chats/group/settings', token, {
        method: 'POST',
        body: JSON.stringify({
          chatId: activeChatId,
          action: 'regenerate_invite_link'
        })
      });
      await loadContext(token, activeChatId);
      await loadBootstrap(token, activeChatId);
      setInfo('Invite-Link neu generiert.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Invite-Link konnte nicht generiert werden.');
    } finally {
      setIsBusy(false);
    }
  };

  const closeActiveGroup = async () => {
    if (!token || !activeChatId || !groupSettings?.canCloseGroup) {
      return;
    }
    const confirmed = window.confirm('Gruppe wirklich schliessen? Sie wird deaktiviert und ist nicht mehr sichtbar.');
    if (!confirmed) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setInfo(null);
    try {
      await api('/api/app/chats/group/settings', token, {
        method: 'POST',
        body: JSON.stringify({
          chatId: activeChatId,
          action: 'close_group'
        })
      });
      setShowGroupManageModal(false);
      const payload = await loadBootstrap(token);
      if (payload.activeChatId) {
        await loadContext(token, payload.activeChatId);
      }
      setInfo('Gruppe wurde geschlossen.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Gruppe konnte nicht geschlossen werden.');
    } finally {
      setIsBusy(false);
    }
  };

  const transferOwnership = async () => {
    if (!ownershipTargetUserId || !groupSettings?.canTransferOwnership) {
      return;
    }
    await manageMember(ownershipTargetUserId, 'transfer_ownership');
    setOwnershipTargetUserId('');
    setInfo('Ownership uebertragen. Du bist jetzt User in der Gruppe.');
  };

  const joinGroupByInviteCode = async () => {
    if (!token) {
      return;
    }
    const inviteCode = groupInviteCodeInput.trim();
    if (!inviteCode) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setInfo(null);
    try {
      const payload = (await api('/api/app/chats/group/join', token, {
        method: 'POST',
        body: JSON.stringify({ inviteCode })
      })) as { chat: { id: string } };
      setGroupInviteCodeInput('');
      await selectChat(payload.chat.id);
      setInfo('Gruppe ueber Invite-Link beigetreten.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Beitritt per Invite-Link fehlgeschlagen.');
    } finally {
      setIsBusy(false);
    }
  };

  const copyInviteLink = async (settings: AppGroupSettings) => {
    const inviteCode = settings.inviteCode?.trim() ?? '';
    if (!inviteCode) {
      return;
    }
    const link = `${appOrigin}/chat?inviteCode=${encodeURIComponent(inviteCode)}`;
    try {
      await navigator.clipboard.writeText(link);
      setInfo('Invite-Link kopiert.');
    } catch {
      setError('Invite-Link konnte nicht kopiert werden.');
    }
  };

  const playMentionTone = () => {
    if (typeof window === 'undefined') {
      return;
    }

    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return;
    }

    try {
      const ctx = mentionAudioRef.current ?? new AudioCtx();
      mentionAudioRef.current = ctx;
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      const now = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(880, now);
      oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.14);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.22);
    } catch {
      // ignore audio errors
    }
  };

  const enableMentionNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      setShowMentionNotificationPrompt(false);
      localStorage.setItem('chat_mentions_notification_prompt_dismissed', '1');
      if (permission === 'granted') {
        playMentionTone();
        setInfo('Desktop-Benachrichtigungen fuer Erwaehnungen aktiviert.');
      } else {
        setInfo('Desktop-Benachrichtigungen nicht aktiviert.');
      }
    } catch {
      setError('Berechtigung fuer Benachrichtigungen konnte nicht angefragt werden.');
    }
  };

  const dismissMentionNotificationPrompt = () => {
    setShowMentionNotificationPrompt(false);
    localStorage.setItem('chat_mentions_notification_prompt_dismissed', '1');
  };

  const pushMentionNotification = (message: AppChatMessage, chatName: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }
    if (notificationPermission !== 'granted') {
      return;
    }

    const textSnippet = message.text.trim() || '[Nachricht]';
    try {
      const notification = new Notification(`Erwaehnung in ${chatName}`, {
        body: `${message.user.fullName}: ${textSnippet}`.slice(0, 220),
        tag: `mention-${message.id}`
      });
      notification.onclick = () => {
        window.focus();
      };
      playMentionTone();
    } catch {
      // ignore notification errors
    }
  };

  const openProfile = async (userId: string) => {
    if (!token) return;

    try {
      const payload = (await api(`/api/app/profile/${encodeURIComponent(userId)}`, token)) as {
        profile: AppUserProfile;
      };
      setProfileCard(payload.profile);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Profil konnte nicht geladen werden.');
    }
  };

  const changeGlobalRole = async (targetUserId: string, role: GlobalRole) => {
    if (!token) return;

    try {
      await api('/api/app/admin/role', token, {
        method: 'POST',
        body: JSON.stringify({ targetUserId, role })
      });
      setInfo(`Globale Rolle auf ${roleLabel(role)} gesetzt.`);
      await loadBootstrap(token, activeChatId ?? undefined);
      if (profileCard?.id === targetUserId) {
        await openProfile(targetUserId);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Rollenwechsel fehlgeschlagen.');
    }
  };

  const logout = async () => {
    if (token) {
      try {
        await api('/api/app/auth/logout', token, { method: 'POST' });
      } catch {
        // noop
      }
    }

    localStorage.removeItem(TOKEN_KEY);
    router.replace('/');
  };

  if (!bootstrap || !me) {
    return (
      <motion.main className="py-4" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38 }}>
        <motion.section className="glass-panel rounded-2xl p-6" initial={{ scale: 0.99 }} animate={{ scale: 1 }} transition={{ duration: 0.3 }}>
          <p className="surface-muted text-sm">Lade Chat-App...</p>
        </motion.section>
      </motion.main>
    );
  }

  return (
    <>
      <motion.main
        className="discord-shell chat-page-shell"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.aside
          className="server-rail hidden md:flex"
          initial={{ opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.34, delay: 0.08 }}
        >
          <motion.button whileHover={{ scale: 1.07, y: -1 }} whileTap={{ scale: 0.96 }} className="server-pill active" onClick={() => void selectChat(activeChatId ?? chats[0]?.id ?? '')}>
            {initials(me)}
          </motion.button>
          {chats.map((chat) => (
            <motion.button
              key={chat.id}
              whileHover={{ scale: 1.07, y: -1 }}
              whileTap={{ scale: 0.96 }}
              className={`server-pill ${chat.id === activeChatId ? 'active' : ''}`}
              onClick={() => void selectChat(chat.id)}
              title={chat.name}
            >
              {chat.kind === 'group' ? '#' : chat.kind === 'direct' ? 'DM' : 'GL'}
              {chat.mentionCount > 0 ? (
                <span className="mention-badge mention-badge-float">{chat.mentionCount > 99 ? '99+' : chat.mentionCount}</span>
              ) : null}
              {chat.unreadCount > 0 ? (
                <span className="unread-badge unread-badge-float">{chat.unreadCount > 99 ? '99+' : chat.unreadCount}</span>
              ) : null}
            </motion.button>
          ))}
        </motion.aside>

        <motion.aside
          className="workspace-panel order-3 md:order-none max-h-[44dvh] overflow-y-auto md:max-h-[calc(100dvh-7.4rem)]"
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.36, delay: 0.12 }}
        >
          <div className="glass-card mb-3 rounded-xl p-3">
            <div className="flex items-center gap-3">
              <Avatar user={me} size={42} sessionToken={token} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">{me.fullName}</p>
                <p className="surface-muted truncate text-xs">@{me.username}</p>
              </div>
              <span className={roleBadgeClass(me.role)}>{roleLabel(me.role)}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <Link className="btn-soft flex-1 text-center text-xs" href="/profile">
                Profil
              </Link>
              <button className="btn-soft text-xs" onClick={() => void logout()}>
                Logout
              </button>
            </div>
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="surface-muted text-xs font-semibold uppercase tracking-wide">Channels</h2>
              <button
                className="btn-soft px-2 py-1 text-[11px] uppercase"
                onClick={() => {
                  setGroupName('');
                  setGroupMemberIds([]);
                  setDiscoverQuery('');
                  setShowGroupModal(true);
                }}
              >
                + Gruppe
              </button>
            </div>

            <ul className="space-y-1.5">
              {chats.map((chat) => (
                <li key={chat.id}>
                  <motion.button
                    whileHover={{ x: 3 }}
                    whileTap={{ scale: 0.985 }}
                    className={`channel-row ${chat.id === activeChatId ? 'active' : ''}`}
                    onClick={() => void selectChat(chat.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-100">
                        {chat.kind === 'group' ? '#' : ''}
                        {chat.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="surface-muted text-[10px] uppercase">{chat.kind}</span>
                        {chat.mentionCount > 0 ? (
                          <span className="mention-badge">{chat.mentionCount > 99 ? '99+' : chat.mentionCount}</span>
                        ) : null}
                        {chat.unreadCount > 0 ? (
                          <span className="unread-badge">{chat.unreadCount > 99 ? '99+' : chat.unreadCount}</span>
                        ) : null}
                      </div>
                    </div>
                  </motion.button>
                </li>
              ))}
            </ul>

            <div className="mt-3 rounded-lg border border-slate-600/60 bg-slate-900/55 p-2">
              <p className="surface-muted text-[11px] uppercase tracking-wide">Per Invite-Code beitreten</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  className="glass-input text-xs"
                  placeholder="Invite-Code"
                  value={groupInviteCodeInput}
                  onChange={(event) => setGroupInviteCodeInput(event.target.value)}
                />
                <button className="btn-soft px-2 py-1 text-xs" onClick={() => void joinGroupByInviteCode()}>
                  Join
                </button>
              </div>
            </div>
          </section>
        </motion.aside>

        <motion.section
          className="chat-stage order-1 md:order-none"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, delay: 0.16 }}
        >
          <header className="chat-header">
            <div className="min-w-0">
              {context?.chat.kind === 'group' ? (
                <button className="truncate text-left text-lg font-semibold text-slate-50 underline-offset-2 hover:underline" onClick={openGroupManagementModal}>
                  {activeChat?.name ?? context?.chat.name ?? 'Chat'}
                </button>
              ) : (
                <h1 className="truncate text-lg font-semibold text-slate-50">{activeChat?.name ?? context?.chat.name ?? 'Chat'}</h1>
              )}
              <p className="surface-muted text-xs uppercase tracking-wide">
                {activeChat?.kind ?? context?.chat.kind ?? 'chat'} · {members.length} Mitglieder · {onlineMembersCount} online
              </p>
            </div>
            <div className="hidden items-center gap-2 text-xs text-slate-300 sm:flex">
              {firstUnreadMessageId && unreadCountAtOpen > 0 ? (
                <button className="btn-soft px-2 py-1 text-xs" onClick={jumpToFirstUnread}>
                  Zum ersten Ungelesenen ({unreadCountAtOpen})
                </button>
              ) : null}
              {context?.chat.kind === 'group' ? (
                <button className="btn-soft px-2 py-1 text-xs" onClick={openGroupManagementModal}>
                  Overview & Settings
                </button>
              ) : null}
            </div>
          </header>

          <AnimatePresence>
            {showMentionNotificationPrompt ? (
              <motion.div className="mention-banner mx-3 mt-2 rounded-lg px-3 py-2 text-xs" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                <p className="text-slate-100">Desktop-Benachrichtigungen fuer @mentions aktivieren?</p>
                <div className="mt-2 flex gap-2">
                  <button className="btn-soft px-2 py-1 text-xs" type="button" onClick={() => void enableMentionNotifications()}>
                    Aktivieren
                  </button>
                  <button className="btn-soft px-2 py-1 text-xs" type="button" onClick={dismissMentionNotificationPrompt}>
                    Spaeter
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="px-3 pb-2">
            <div className="glass-card rounded-lg p-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="glass-input min-w-[12rem] flex-1 text-xs"
                  placeholder="Nachrichten durchsuchen..."
                  value={messageSearchQuery}
                  onChange={(event) => setMessageSearchQuery(event.target.value)}
                />
                <select className="glass-input text-xs" value={messageSenderFilter} onChange={(event) => setMessageSenderFilter(event.target.value)}>
                  <option value="all">Alle Sender</option>
                  {members.map((member) => (
                    <option key={member.user.id} value={member.user.id}>
                      {member.user.fullName}
                    </option>
                  ))}
                </select>
                <button className={`btn-soft px-2 py-1 text-xs ${showPinnedOnly ? 'border-indigo-400/70 text-indigo-100' : ''}`} type="button" onClick={() => setShowPinnedOnly((prev) => !prev)}>
                  Nur Pinned
                </button>
              </div>
            </div>
          </div>

          <motion.div className="message-list" onClick={() => setActionMenuMessageId(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.2 }}>
            {filteredMessages.map((message) => {
              const isMe = message.user.id === me.id;
              const isUnreadStart = firstUnreadMessageId === message.id && unreadCountAtOpen > 0;
              const canEdit = isMe && !message.deletedForAll;
              const allowDeleteForAll = canDeleteForAll(message);
              const displayText = message.deletedForAll ? 'Nachricht wurde geloescht.' : message.text;
              const isGroupChat = context?.chat.kind === 'group';
              const isDirectChat = context?.chat.kind === 'direct';
              const latestReadAt = message.readBy.length > 0 ? message.readBy[message.readBy.length - 1]?.readAt ?? null : null;
              const hasReaders = message.readBy.length > 0;
              const mentionsMe =
                !isMe &&
                !message.deletedForAll &&
                (
                  message.mentionedMe ||
                  isMentioningUser(displayText, me.username) ||
                  isMentioningFullName(displayText, me.fullName) ||
                  isSpecialMention(displayText, 'everyone') ||
                  isSpecialMention(displayText, 'here')
                );

              return (
                <motion.div id={`chat-msg-${message.id}`} key={message.id} initial={{ opacity: 0, y: 10, scale: 0.992 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.25 }}>
                  {isUnreadStart ? (
                    <div ref={firstUnreadRef} className="unread-separator">
                      <span>Ungelesene Nachrichten ({unreadCountAtOpen})</span>
                    </div>
                  ) : null}
                  <motion.article className={`msg-row ${isMe ? 'me' : 'other'}`} initial={{ opacity: 0.98 }} animate={{ opacity: 1 }}>
                    <motion.div className={`msg-bubble ${isMe ? 'me' : 'other'} ${mentionsMe ? 'mention' : ''}`} whileHover={{ y: -1 }}>
                      <header className="mb-1 flex items-center justify-between gap-2">
                        <button className="flex min-w-0 items-center gap-2" onClick={() => void openProfile(message.user.id)}>
                          {!isMe ? <Avatar user={message.user} size={20} sessionToken={token} /> : null}
                          <span className={`truncate text-xs font-semibold ${isMe ? 'text-indigo-50' : 'text-slate-100'}`}>
                            {isMe ? 'Du' : message.user.fullName}
                          </span>
                        </button>
                        <div className="flex items-center gap-1.5">
                          {message.isPinned ? <span className="surface-muted text-[11px]">📌</span> : null}
                          <time className={`text-[11px] ${isMe ? 'text-indigo-100/80' : 'text-slate-400'}`}>
                            {formatTime(message.createdAt)}
                            {message.editedAt ? ' · bearbeitet' : ''}
                          </time>
                          <div className="relative">
                            <button
                              className="message-menu-trigger"
                              onClick={(event) => {
                                event.stopPropagation();
                                openMenuForMessage(message.id, event.currentTarget);
                              }}
                            >
                              ⋯
                            </button>
                            {actionMenuMessageId === message.id && actionMenuPosition && typeof document !== 'undefined'
                              ? createPortal(
                                  <div
                                    ref={actionMenuRef}
                                    className="message-menu"
                                    style={{
                                      top: actionMenuPosition.top,
                                      left: actionMenuPosition.left,
                                      maxHeight: actionMenuPosition.maxHeight
                                    }}
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <div className="message-menu-row">
                                      {QUICK_EMOJIS.slice(0, 6).map((emoji) => (
                                        <button key={`${message.id}-menu-${emoji}`} className="reaction-chip quick" onClick={() => void reactToMessage(message.id, emoji)}>
                                          {emoji}
                                        </button>
                                      ))}
                                      <button
                                        className="btn-soft px-2 py-1 text-[10px]"
                                        onClick={() => {
                                          setEmojiTargetMessageId(message.id);
                                          setShowEmojiPanel(true);
                                          setActionMenuMessageId(null);
                                        }}
                                      >
                                        Alle Emojis
                                      </button>
                                    </div>
                                    <button className="message-menu-item" onClick={() => replyToMessage(message)}>
                                      Antworten
                                    </button>
                                    {canPinMessage() ? (
                                      <button className="message-menu-item" onClick={() => void togglePinMessage(message.id)}>
                                        {message.isPinned ? 'Unpin' : 'Pin'}
                                      </button>
                                    ) : null}
                                    {canEdit ? (
                                      <button className="message-menu-item" onClick={() => startEditMessage(message)}>
                                        Bearbeiten
                                      </button>
                                    ) : null}
                                    <button className="message-menu-item danger" onClick={() => openDeleteModal(message)}>
                                      Loeschen
                                    </button>
                                    {!allowDeleteForAll ? <p className="message-menu-hint">Fuer alle nur als Gruppen-Owner oder globaler Superadmin.</p> : null}
                                  </div>,
                                  document.body
                                )
                              : null}
                          </div>
                        </div>
                      </header>

                      {message.replyTo ? (
                        <div className={`reply-chip ${isMe ? 'me' : 'other'}`}>
                          <p className="reply-author">{message.replyTo.authorName}</p>
                          <p className="reply-text">{message.replyTo.textSnippet}</p>
                        </div>
                      ) : null}

                      {displayText ? <p className={`whitespace-pre-wrap break-words text-sm ${isMe ? 'text-indigo-50' : 'text-slate-100'}`}>{displayText}</p> : null}

                      {message.gif && !message.deletedForAll ? (
                        <div className="mt-2">
                          <img
                            src={message.gif.previewUrl || message.gif.url}
                            alt={message.gif.title ?? 'GIF'}
                            className="max-h-72 w-full rounded-lg object-cover"
                          />
                        </div>
                      ) : null}

                      {message.attachments.length > 0 && !message.deletedForAll ? (
                        <div className="mt-2 space-y-2">
                          {message.attachments.map((attachment) => (
                            <div key={attachment.id} className="attachment-chip">
                              {isImageAttachment(attachment.mimeType) ? (
                                <img
                                  src={uploadUrl(attachment.id, token)}
                                  alt={attachment.fileName}
                                  className="max-h-56 w-full rounded-md object-cover"
                                />
                              ) : (
                                <a
                                  href={uploadUrl(attachment.id, token)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs underline"
                                >
                                  {attachment.fileName} ({Math.ceil(attachment.size / 1024)} KB)
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {message.poll && !message.deletedForAll ? (
                        <div className="poll-card mt-2">
                          <p className={`text-xs font-semibold ${isMe ? 'text-indigo-50' : 'text-slate-100'}`}>{message.poll.question}</p>
                          <div className="mt-2 space-y-1.5">
                            {message.poll.options.map((option) => (
                              <button
                                key={option.id}
                                className={`poll-option ${option.votedByMe ? 'active' : ''}`}
                                onClick={() => void votePoll(message.id, option.id)}
                                disabled={message.poll?.closed}
                              >
                                <span>{option.text}</span>
                                <span>{option.votes}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {isMe && !message.deletedForAll && isGroupChat ? (
                        hasReaders ? (
                          <div className="msg-read-group">
                            <span className="msg-read-label">Gelesen von</span>
                            <div className="msg-read-chips">
                              {message.readBy.slice(-10).map((receipt) => (
                                <span key={`${message.id}-${receipt.userId}-${receipt.readAt}`} className="msg-read-chip">
                                  {initialsFromFullName(receipt.fullName)}
                                  <span className="msg-read-tooltip">
                                    {receipt.fullName} · {formatTime(receipt.readAt)}
                                  </span>
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="msg-read-direct">Zugestellt</p>
                        )
                      ) : null}

                      {isMe && !message.deletedForAll && isDirectChat ? (
                        <p className="msg-read-direct">
                          {latestReadAt ? `Gelesen ${formatTime(latestReadAt)}` : 'Zugestellt'}
                        </p>
                      ) : null}
                    </motion.div>
                  </motion.article>
                </motion.div>
              );
            })}

            {filteredMessages.length === 0 ? <p className="surface-muted text-sm">Keine Nachrichten fuer diesen Filter.</p> : null}
            <div ref={bottomRef} />
          </motion.div>

          <motion.div className="min-h-6 px-4 pb-1 text-xs text-slate-300" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }}>
            {typingUsers.length > 0 ? (
              <motion.span className="typing-indicator" initial={{ opacity: 0.55 }} animate={{ opacity: 1 }}>
                {typingUsers.slice(0, 3).map((user) => user.fullName).join(', ')}
                {typingUsers.length > 1 ? ' tippen...' : ' tippt...'}
              </motion.span>
            ) : null}
          </motion.div>

          <motion.form onSubmit={sendMessage} className="chat-composer" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <div className="glass-card rounded-xl p-2">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                  <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} className="btn-soft px-2 py-1 text-xs" type="button" onClick={() => fileInputRef.current?.click()}>
                    Datei/Bild
                  </motion.button>
                <button
                  className="btn-soft px-2 py-1 text-xs"
                  type="button"
                  onClick={() => {
                    setEmojiTargetMessageId(null);
                    setShowEmojiPanel((prev) => !prev);
                  }}
                >
                  Emoji
                </button>
                <button
                  className="btn-soft px-2 py-1 text-xs"
                  type="button"
                  onClick={() => {
                    setGifQuery('');
                    setGifResults([]);
                    setGifNextCursor(null);
                    setGifLoading(false);
                    setActiveGifCategory('');
                    setShowGifModal(true);
                  }}
                >
                  GIF
                </button>
                <button
                  className="btn-soft px-2 py-1 text-xs"
                  type="button"
                  onClick={() => {
                    setShowPollModal(true);
                  }}
                >
                  Umfrage
                </button>
                {context?.chat.kind === 'group' && groupSettings?.canUseEveryoneMention ? (
                  <button className="btn-soft px-2 py-1 text-xs" type="button" onClick={() => appendMentionToken('@everyone')}>
                    @everyone
                  </button>
                ) : null}
                {context?.chat.kind === 'group' && groupSettings?.canUseHereMention ? (
                  <button className="btn-soft px-2 py-1 text-xs" type="button" onClick={() => appendMentionToken('@here')}>
                    @here
                  </button>
                ) : null}
                {isUploading ? <span className="surface-muted text-xs">Upload laeuft...</span> : null}
                {isResolvingTenorLink ? <span className="surface-muted text-xs">Tenor-Link wird als GIF erkannt...</span> : null}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void uploadAttachment(file);
                    event.currentTarget.value = '';
                  }}
                />
              </div>

              {showEmojiPanel ? (
                <div className="emoji-panel mb-2">
                  <div className="emoji-tabs">
                    {EMOJI_CATEGORIES.map((category) => (
                      <button
                        key={category.key}
                        type="button"
                        className={`emoji-tab ${emojiCategory === category.key ? 'active' : ''}`}
                        onClick={() => setEmojiCategory(category.key)}
                      >
                        {category.label}
                      </button>
                    ))}
                  </div>
                  <div className="emoji-grid">
                    {(EMOJI_CATEGORIES.find((category) => category.key === emojiCategory)?.emojis ?? QUICK_EMOJIS).map((emoji) => (
                      <button key={`${emojiCategory}-${emoji}`} type="button" className="emoji-btn" onClick={() => addEmoji(emoji)}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {editingMessageId ? (
                <div className="composer-banner warn mb-2">
                  Bearbeitung aktiv
                  <button type="button" className="underline" onClick={cancelEdit}>
                    Abbrechen
                  </button>
                </div>
              ) : null}

              {replyTarget ? (
                <div className="composer-banner mb-2">
                  Antwort auf {replyTarget.user.fullName}: {replyTarget.text || (replyTarget.deletedForAll ? 'Nachricht geloescht.' : '[Nachricht]')}
                  <button type="button" className="underline" onClick={() => setReplyTarget(null)}>
                    Entfernen
                  </button>
                </div>
              ) : null}

              {pendingAttachments.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pendingAttachments.map((attachment) => (
                    <button key={attachment.id} type="button" className="attachment-chip text-xs" onClick={() => removePendingAttachment(attachment.id)}>
                      {attachment.fileName} ×
                    </button>
                  ))}
                </div>
              ) : null}

              {selectedGif ? (
                <div className="mb-2 flex items-center gap-2">
                  <img src={selectedGif.previewUrl || selectedGif.url} alt="GIF" className="h-12 w-20 rounded object-cover" />
                  <button type="button" className="btn-soft px-2 py-1 text-xs" onClick={() => setSelectedGif(null)}>
                    GIF entfernen
                  </button>
                </div>
              ) : null}

              {pollQuestion.trim() ? (
                <div className="mb-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1.5 text-xs text-cyan-100">
                  Umfrage: {pollQuestion} ({pollOptions.filter((item) => item.trim().length > 0).length} Optionen)
                  <button type="button" className="ml-2 underline" onClick={clearPoll}>
                    Entfernen
                  </button>
                </div>
              ) : null}

              <div className="composer-input-wrap">
                {mentionMenuVisible ? (
                  <motion.div className="mention-suggest-panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                    {mentionSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        className={`mention-suggest-item ${activeMentionSuggestion?.id === suggestion.id ? 'active' : ''}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          if (!suggestion.disabled) {
                            applyMentionSuggestion(suggestion.value);
                          }
                        }}
                        disabled={suggestion.disabled}
                      >
                        <span className="mention-suggest-label">{suggestion.label}</span>
                        <span className="mention-suggest-subtitle">{suggestion.subtitle}</span>
                      </button>
                    ))}
                  </motion.div>
                ) : null}
                <div className="flex items-center gap-2">
                  <input
                    className="glass-input border-none bg-transparent text-sm shadow-none focus:shadow-none"
                    placeholder={editingMessageId ? 'Nachricht bearbeiten...' : 'Nachricht schreiben...'}
                    value={text}
                    onFocus={() => setComposerFocused(true)}
                    onChange={(event) => handleComposerChange(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    onBlur={() => {
                      setComposerFocused(false);
                      if (typingActiveRef.current) {
                        typingActiveRef.current = false;
                        void setTypingState(false);
                      }
                    }}
                    maxLength={4000}
                  />
                  <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.985 }} className="btn-primary px-4 py-2 text-sm" type="submit">
                    {editingMessageId ? 'Speichern' : 'Senden'}
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.form>

          {error ? <motion.p className="alert-error mx-3 mb-3 rounded-md px-3 py-2 text-sm" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>{error}</motion.p> : null}
          {info ? <motion.p className="alert-info mx-3 mb-3 rounded-md px-3 py-2 text-sm" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>{info}</motion.p> : null}
        </motion.section>

        <motion.aside
          className="workspace-panel order-2 md:order-none max-h-[44dvh] overflow-y-auto md:max-h-[calc(100dvh-7.4rem)]"
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.36, delay: 0.2 }}
        >
          <section>
            <h2 className="surface-muted text-xs font-semibold uppercase tracking-wide">Members ({members.length})</h2>
            <ul className="mt-2 max-h-52 space-y-1.5 overflow-y-auto">
              {members.map((member) => (
                <motion.li key={member.user.id} className="glass-card rounded-lg p-2 text-sm" whileHover={{ x: 2 }}>
                  <div className="flex items-center justify-between gap-2">
                    <button className="flex min-w-0 items-center gap-2" onClick={() => void openProfile(member.user.id)}>
                      <span className={`h-2 w-2 rounded-full ${member.isOnline ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                      <Avatar user={member.user} size={22} sessionToken={token} />
                      <span className="truncate">{member.user.fullName}</span>
                    </button>
                    <span className="surface-muted text-[11px] uppercase">{groupRoleLabel(member.role)}</span>
                  </div>
                </motion.li>
              ))}
            </ul>
          </section>

          <section className="mt-4">
            <h2 className="surface-muted text-xs font-semibold uppercase tracking-wide">Discover</h2>
            <input
              className="glass-input mt-2 text-sm"
              placeholder="Suche User"
              value={discoverQuery}
              onChange={(event) => setDiscoverQuery(event.target.value)}
            />
            <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
              {discoverUsers.map((user) => (
                <motion.li key={user.id} className="glass-card rounded-lg p-2 text-sm" whileHover={{ x: 2 }}>
                  <div className="flex items-center justify-between gap-2">
                    <button className="flex min-w-0 items-center gap-2" onClick={() => void openProfile(user.id)}>
                      <Avatar user={user} size={24} sessionToken={token} />
                      <span className="truncate">{user.fullName}</span>
                    </button>
                    <div className="flex gap-1">
                      <button className="btn-soft px-2 py-1 text-xs" onClick={() => void startDirect(user.id)}>
                        DM
                      </button>
                      {!user.isFriend ? (
                        <button className="btn-soft px-2 py-1 text-xs" onClick={() => void sendFriendRequest(user.id)}>
                          Add
                        </button>
                      ) : null}
                    </div>
                  </div>
                </motion.li>
              ))}
            </ul>
          </section>

        </motion.aside>
      </motion.main>

      {showGroupManageModal && context?.chat.kind === 'group' && groupSettings ? (
        <motion.div className="modal-overlay" onClick={() => setShowGroupManageModal(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <motion.div className="modal-card" onClick={(event) => event.stopPropagation()} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
            <h2 className="text-lg font-semibold text-slate-100">Group Overview & Settings</h2>
            <p className="surface-muted mt-1 text-xs">
              WhatsApp/Discord-style Uebersicht mit Schnellfinder fuer Links, Medien und Dateien.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className={`btn-soft px-2 py-1 text-xs ${groupOverviewTab === 'overview' ? 'border-indigo-400/70 text-indigo-100' : ''}`}
                type="button"
                onClick={() => setGroupOverviewTab('overview')}
              >
                Overview
              </button>
              <button
                className={`btn-soft px-2 py-1 text-xs ${groupOverviewTab === 'finder' ? 'border-indigo-400/70 text-indigo-100' : ''}`}
                type="button"
                onClick={() => setGroupOverviewTab('finder')}
              >
                Links & Media Finder
              </button>
              {(groupSettings.canManageUsers || groupSettings.canManageSettings || groupSettings.canTransferOwnership || groupSettings.canCloseGroup) ? (
                <button
                  className={`btn-soft px-2 py-1 text-xs ${groupOverviewTab === 'admin' ? 'border-indigo-400/70 text-indigo-100' : ''}`}
                  type="button"
                  onClick={() => setGroupOverviewTab('admin')}
                >
                  Admin
                </button>
              ) : null}
            </div>

            {groupOverviewTab === 'overview' ? (
              <section className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-slate-700/70 bg-slate-900/45 p-3">
                    <p className="surface-muted text-[11px] uppercase tracking-wide">Mitglieder</p>
                    <p className="mt-1 text-xl font-semibold text-slate-100">{members.length}</p>
                  </div>
                  <div className="rounded-lg border border-slate-700/70 bg-slate-900/45 p-3">
                    <p className="surface-muted text-[11px] uppercase tracking-wide">Online</p>
                    <p className="mt-1 text-xl font-semibold text-emerald-300">{onlineMembersCount}</p>
                  </div>
                  <div className="rounded-lg border border-slate-700/70 bg-slate-900/45 p-3">
                    <p className="surface-muted text-[11px] uppercase tracking-wide">Medien</p>
                    <p className="mt-1 text-xl font-semibold text-slate-100">{groupImages.length}</p>
                  </div>
                  <div className="rounded-lg border border-slate-700/70 bg-slate-900/45 p-3">
                    <p className="surface-muted text-[11px] uppercase tracking-wide">Links</p>
                    <p className="mt-1 text-xl font-semibold text-slate-100">{groupLinks.length}</p>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-700/70 bg-slate-900/45 p-3">
                  <p className="surface-muted text-[11px] uppercase tracking-wide">Erstellt</p>
                  <p className="mt-1 text-sm text-slate-100">{new Date(context.chat.createdAt).toLocaleString()}</p>
                </div>
                {groupSettings.inviteCode ? (
                  <div className="rounded-lg border border-slate-700/70 bg-slate-900/45 p-3">
                    <p className="surface-muted text-[11px] uppercase tracking-wide">Invite-Link</p>
                    <p className="mt-1 break-all text-xs text-slate-100">{`${appOrigin}/chat?inviteCode=${encodeURIComponent(groupSettings.inviteCode)}`}</p>
                    <button className="btn-soft mt-2 px-2 py-1 text-xs" type="button" onClick={() => void copyInviteLink(groupSettings)}>
                      Link kopieren
                    </button>
                  </div>
                ) : null}
              </section>
            ) : null}

            {groupOverviewTab === 'finder' ? (
              <section className="mt-4">
                <input
                  className="glass-input text-sm"
                  placeholder="Suche nach Link, Datei oder Name..."
                  value={finderQuery}
                  onChange={(event) => setFinderQuery(event.target.value)}
                />
                <div className="mt-3 space-y-4">
                  <div>
                    <h3 className="surface-muted text-xs font-semibold uppercase tracking-wide">Links ({visibleLinks.length})</h3>
                    <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
                      {visibleLinks.map((item) => (
                        <li key={`${item.messageId}-${item.url}`} className="rounded-lg border border-slate-700/70 bg-slate-900/45 p-2">
                          <a href={item.url} target="_blank" rel="noreferrer" className="break-all text-xs text-cyan-200 underline">
                            {item.url}
                          </a>
                          <p className="surface-muted mt-1 text-[11px]">{item.author} · {formatTime(item.createdAt)}</p>
                        </li>
                      ))}
                      {visibleLinks.length === 0 ? <li className="surface-muted text-xs">Keine Links gefunden.</li> : null}
                    </ul>
                  </div>
                  <div>
                    <h3 className="surface-muted text-xs font-semibold uppercase tracking-wide">Bilder ({visibleImages.length})</h3>
                    <div className="mt-2 grid max-h-48 grid-cols-3 gap-2 overflow-y-auto pr-1">
                      {visibleImages.map((item) => (
                        <a key={`${item.messageId}-${item.attachment.id}`} href={uploadUrl(item.attachment.id, token)} target="_blank" rel="noreferrer">
                          <img
                            src={uploadUrl(item.attachment.id, token)}
                            alt={item.attachment.fileName}
                            className="h-20 w-full rounded-md border border-slate-700/70 object-cover"
                          />
                        </a>
                      ))}
                      {visibleImages.length === 0 ? <p className="surface-muted col-span-3 text-xs">Keine Bilder gefunden.</p> : null}
                    </div>
                  </div>
                  <div>
                    <h3 className="surface-muted text-xs font-semibold uppercase tracking-wide">Dateien ({visibleFiles.length})</h3>
                    <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
                      {visibleFiles.map((item) => (
                        <li key={`${item.messageId}-${item.attachment.id}`} className="rounded-lg border border-slate-700/70 bg-slate-900/45 p-2">
                          <a href={uploadUrl(item.attachment.id, token)} target="_blank" rel="noreferrer" className="text-xs text-cyan-200 underline">
                            {item.attachment.fileName}
                          </a>
                          <p className="surface-muted mt-1 text-[11px]">
                            {Math.ceil(item.attachment.size / 1024)} KB · {item.author} · {formatTime(item.createdAt)}
                          </p>
                        </li>
                      ))}
                      {visibleFiles.length === 0 ? <li className="surface-muted text-xs">Keine Dateien gefunden.</li> : null}
                    </ul>
                  </div>
                </div>
              </section>
            ) : null}

            {groupOverviewTab === 'admin' ? (
            <>
            <section className="mt-4">
              <h3 className="surface-muted text-xs font-semibold uppercase tracking-wide">Pinned Messages</h3>
              <ul className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">
                {pinnedMessages.map((message) => (
                  <li key={`pinned-${message.id}`} className="rounded-lg border border-slate-700/70 bg-slate-900/45 p-2">
                    <p className="truncate text-xs text-slate-100">{message.text || '[Anhang / Medien]'}</p>
                    <p className="surface-muted mt-1 text-[11px]">
                      {message.user.fullName} · {message.pinnedAt ? new Date(message.pinnedAt).toLocaleString() : formatTime(message.createdAt)}
                    </p>
                  </li>
                ))}
                {pinnedMessages.length === 0 ? <li className="surface-muted text-xs">Keine angepinnten Nachrichten.</li> : null}
              </ul>
            </section>

            <section className="mt-4">
              <h3 className="surface-muted text-xs font-semibold uppercase tracking-wide">Moderation Log</h3>
              <ul className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">
                {moderationLogs.map((event) => (
                  (() => {
                    const eventMessageId = event.messageId;
                    return (
                  <li key={event.id} className="rounded-lg border border-slate-700/70 bg-slate-900/45 p-2">
                    <p className="text-xs text-slate-100">
                      {event.actorName} · {moderationActionLabel(event.action)}
                      {event.targetName ? ` · ${event.targetName}` : ''}
                    </p>
                    {moderationDetailsLabel(event.details) ? (
                      <p className="surface-muted mt-1 text-[11px]">{moderationDetailsLabel(event.details)}</p>
                    ) : null}
                    <p className="surface-muted mt-1 text-[11px]">{new Date(event.createdAt).toLocaleString()}</p>
                    {eventMessageId ? (
                      <button className="btn-soft mt-2 px-2 py-1 text-[11px]" type="button" onClick={() => jumpToMessageFromModeration(eventMessageId)}>
                        Zur Nachricht springen
                      </button>
                    ) : null}
                  </li>
                    );
                  })()
                ))}
                {moderationLogs.length === 0 ? <li className="surface-muted text-xs">Noch keine Moderationsereignisse.</li> : null}
              </ul>
            </section>

            <section className="mt-4">
              <h3 className="surface-muted text-xs font-semibold uppercase tracking-wide">User verwalten</h3>
              <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
                {members.map((member) => {
                  const canPromote = groupSettings.canManageUsers && context.chat.memberRole === 'owner' && member.role === 'member';
                  const canDemote = groupSettings.canManageUsers && context.chat.memberRole === 'owner' && member.role === 'admin';
                  const canKick =
                    groupSettings.canManageUsers &&
                    member.user.id !== me.id &&
                    member.role !== 'owner' &&
                    (context.chat.memberRole === 'owner' || member.role === 'member');

                  return (
                    <li key={member.user.id} className="glass-card rounded-lg p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          <span className={`mr-1 inline-block h-2 w-2 rounded-full ${member.isOnline ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                          {member.user.fullName} ({groupRoleLabel(member.role)})
                        </span>
                        <div className="flex gap-1">
                          {canPromote ? (
                            <button className="btn-soft px-2 py-1 text-xs" type="button" onClick={() => void manageMember(member.user.id, 'promote')}>
                              zu Admin
                            </button>
                          ) : null}
                          {canDemote ? (
                            <button className="btn-soft px-2 py-1 text-xs" type="button" onClick={() => void manageMember(member.user.id, 'demote')}>
                              zu User
                            </button>
                          ) : null}
                          {canKick ? (
                            <button className="btn-soft px-2 py-1 text-xs" type="button" onClick={() => void manageMember(member.user.id, 'kick')}>
                              Entfernen
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-3 rounded-lg border border-slate-700/70 bg-slate-900/45 p-2">
                <p className="surface-muted text-[11px] uppercase tracking-wide">Direkt hinzufuegen</p>
                <select
                  className="glass-input mt-2 text-sm"
                  value=""
                  onChange={(event) => {
                    const targetUserId = event.target.value;
                    if (targetUserId) {
                      void manageMember(targetUserId, 'invite');
                    }
                  }}
                  disabled={!groupSettings.canInviteDirectly}
                >
                  <option value="">
                    {groupSettings.canInviteDirectly
                      ? 'User aus Discover hinzufuegen...'
                      : `Deaktiviert (${groupSettings.inviteMode === 'invite_link' ? 'Invite-Link erforderlich' : `Policy: ${invitePolicyLabel(groupSettings.invitePolicy)}`})`}
                  </option>
                  {discoverCandidates.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            {groupSettings.canManageSettings ? (
              <section className="mt-4">
                <h3 className="surface-muted text-xs font-semibold uppercase tracking-wide">Gruppen-Policy</h3>
                <div className="mt-2 space-y-2">
                  <label className="block space-y-1">
                    <span className="surface-muted text-xs uppercase tracking-wide">Beitrittsmodus</span>
                    <select className="glass-input text-sm" value={groupInviteModeDraft} onChange={(event) => setGroupInviteModeDraft(event.target.value as GroupInviteMode)}>
                      <option value="direct">Direktes Hinzufuegen erlaubt</option>
                      <option value="invite_link">Nur via Invite-Link</option>
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="surface-muted text-xs uppercase tracking-wide">Wer darf direkt hinzufuegen?</span>
                    <select className="glass-input text-sm" value={groupInvitePolicyDraft} onChange={(event) => setGroupInvitePolicyDraft(event.target.value as GroupInvitePolicy)}>
                      <option value="everyone">Jeder in der Gruppe</option>
                      <option value="admins">Admins + Superadmin</option>
                      <option value="owner">Nur Superadmin</option>
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="surface-muted text-xs uppercase tracking-wide">Wer darf @everyone nutzen?</span>
                    <select
                      className="glass-input text-sm"
                      value={groupEveryoneMentionPolicyDraft}
                      onChange={(event) => setGroupEveryoneMentionPolicyDraft(event.target.value as GroupMentionPolicy)}
                    >
                      <option value="everyone">Jeder in der Gruppe</option>
                      <option value="admins">Admins + Superadmin</option>
                      <option value="owner">Nur Superadmin</option>
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="surface-muted text-xs uppercase tracking-wide">Wer darf @here nutzen?</span>
                    <select
                      className="glass-input text-sm"
                      value={groupHereMentionPolicyDraft}
                      onChange={(event) => setGroupHereMentionPolicyDraft(event.target.value as GroupMentionPolicy)}
                    >
                      <option value="everyone">Jeder in der Gruppe</option>
                      <option value="admins">Admins + Superadmin</option>
                      <option value="owner">Nur Superadmin</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-2 rounded-md border border-slate-700/70 bg-slate-900/45 px-3 py-2 text-sm text-slate-200">
                    <input type="checkbox" checked={groupAutoHide24hDraft} onChange={(event) => setGroupAutoHide24hDraft(event.target.checked)} />
                    Nachrichten nach 24h fuer alle ausblenden (DB bleibt erhalten)
                  </label>

                  <button className="btn-primary text-sm" type="button" onClick={() => void saveGroupSettings()} disabled={isBusy}>
                    {isBusy ? 'Speichere...' : 'Einstellungen speichern'}
                  </button>
                </div>
              </section>
            ) : null}

            <section className="mt-4">
              <h3 className="surface-muted text-xs font-semibold uppercase tracking-wide">Invite-Link</h3>
              {groupSettings.inviteCode ? (
                <div className="mt-2 rounded-lg border border-slate-700/70 bg-slate-900/45 p-2">
                  <p className="text-xs text-slate-100 break-all">
                    {`${appOrigin}/chat?inviteCode=${encodeURIComponent(groupSettings.inviteCode)}`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className="btn-soft px-2 py-1 text-xs" type="button" onClick={() => void copyInviteLink(groupSettings)}>
                      Link kopieren
                    </button>
                    {groupSettings.canManageSettings ? (
                      <button className="btn-soft px-2 py-1 text-xs" type="button" onClick={() => void regenerateInviteLink()} disabled={isBusy}>
                        Neu generieren
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="surface-muted mt-2 text-sm">Kein Invite-Link aktiv.</p>
              )}
            </section>

            {groupSettings.canTransferOwnership ? (
              <section className="mt-4">
                <h3 className="surface-muted text-xs font-semibold uppercase tracking-wide">Ownership uebertragen</h3>
                <div className="mt-2 flex items-center gap-2">
                  <select className="glass-input text-sm" value={ownershipTargetUserId} onChange={(event) => setOwnershipTargetUserId(event.target.value)}>
                    <option value="">Neuen Superadmin auswaehlen...</option>
                    {members
                      .filter((member) => member.user.id !== me.id)
                      .map((member) => (
                        <option key={member.user.id} value={member.user.id}>
                          {member.user.fullName} ({groupRoleLabel(member.role)})
                        </option>
                      ))}
                  </select>
                  <button
                    className="btn-soft px-2 py-1 text-xs"
                    type="button"
                    onClick={() => void transferOwnership()}
                    disabled={!ownershipTargetUserId}
                  >
                    Uebertragen
                  </button>
                </div>
              </section>
            ) : null}

            {groupSettings.canCloseGroup ? (
              <section className="mt-4">
                <h3 className="surface-muted text-xs font-semibold uppercase tracking-wide">Gruppe schliessen</h3>
                <button className="btn-soft btn-danger mt-2 text-sm" type="button" onClick={() => void closeActiveGroup()} disabled={isBusy}>
                  Gruppe dauerhaft deaktivieren
                </button>
              </section>
            ) : null}
            </>
            ) : null}

            <button className="btn-soft mt-4 w-full" type="button" onClick={() => setShowGroupManageModal(false)}>
              Schliessen
            </button>
          </motion.div>
        </motion.div>
      ) : null}

      {showGroupModal ? (
        <motion.div className="modal-overlay" onClick={() => setShowGroupModal(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <motion.div className="modal-card" onClick={(event) => event.stopPropagation()} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
            <h2 className="text-lg font-semibold text-slate-100">Neue Gruppe erstellen</h2>
            <p className="surface-muted mt-1 text-xs">Discord-Style Group Creator mit schneller Channel-Struktur.</p>

            <label className="mt-4 block space-y-1">
              <span className="surface-muted text-xs uppercase tracking-wide">Gruppenname</span>
              <input
                className="glass-input text-sm"
                placeholder="z.B. Team-Chat"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
              />
            </label>

            <label className="mt-3 block space-y-1">
              <span className="surface-muted text-xs uppercase tracking-wide">Mitglieder suchen</span>
              <input
                className="glass-input text-sm"
                placeholder="Name oder @username"
                value={discoverQuery}
                onChange={(event) => setDiscoverQuery(event.target.value)}
              />
            </label>

            <div className="modal-member-list mt-3">
              {discoverUsers.map((user) => {
                const checked = groupMemberIds.includes(user.id);
                return (
                  <label key={user.id} className="modal-member-item">
                    <input type="checkbox" checked={checked} onChange={() => toggleGroupMember(user.id)} />
                    <Avatar user={user} size={24} sessionToken={token} />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-100">{user.fullName}</p>
                      <p className="surface-muted truncate text-[11px]">@{user.username}</p>
                    </div>
                  </label>
                );
              })}
              {discoverUsers.length === 0 ? <p className="surface-muted text-sm">Keine Treffer.</p> : null}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-soft" onClick={() => setShowGroupModal(false)}>
                Abbrechen
              </button>
              <button disabled={isBusy || !groupName.trim()} className="btn-primary" onClick={() => void createGroup()}>
                {isBusy ? 'Erstelle...' : 'Gruppe erstellen'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}

      {showGifModal ? (
        <motion.div className="modal-overlay" onClick={() => setShowGifModal(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <motion.div className="modal-card" onClick={(event) => event.stopPropagation()} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
            <h2 className="text-lg font-semibold text-slate-100">GIF Picker (Discord Style)</h2>
            <div className="mt-3">
              <input
                className="glass-input text-sm"
                placeholder="GIF suchen..."
                value={gifQuery}
                onChange={(event) => setGifQuery(event.target.value)}
              />
            </div>
            {!gifQuery.trim() ? (
              <div className="gif-tabs mt-3">
                <button
                  className={`gif-tab ${activeGifCategory === GIF_SAVED_CATEGORY ? 'active' : ''}`}
                  onClick={() => setActiveGifCategory(GIF_SAVED_CATEGORY)}
                >
                  Gespeichert
                </button>
                <button
                  className={`gif-tab ${activeGifCategory === '' ? 'active' : ''}`}
                  onClick={() => setActiveGifCategory('')}
                >
                  Trending
                </button>
                {visibleGifCategories.slice(0, 14).map((category) => (
                  <button
                    key={category.searchterm}
                    className={`gif-tab ${activeGifCategory === category.searchterm ? 'active' : ''}`}
                    onClick={() => setActiveGifCategory(category.searchterm)}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="gif-grid mt-3">
              {gifResults.map((gif) => (
                <button key={gif.id} className="overflow-hidden rounded-lg border border-slate-600/50" onClick={() => selectGif(gif)}>
                  <img src={gif.previewUrl || gif.url} alt={gif.title} className="h-28 w-full object-cover" />
                </button>
              ))}
              {gifResults.length === 0 ? (
                <p className="surface-muted text-sm">
                  {activeGifCategory === GIF_SAVED_CATEGORY
                    ? 'Keine gespeicherten GIFs.'
                    : 'Keine GIFs gefunden. Pruefe TENOR_API_KEY und versuche einen Suchbegriff.'}
                </p>
              ) : null}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="surface-muted text-xs">{gifResults.length} GIFs geladen</p>
              {gifNextCursor ? (
                <button className="btn-soft px-2 py-1 text-xs" type="button" onClick={loadMoreGifs} disabled={gifLoading}>
                  {gifLoading ? 'Lade mehr...' : 'Mehr GIFs'}
                </button>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}

      {showPollModal ? (
        <motion.div className="modal-overlay" onClick={() => setShowPollModal(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <motion.div className="modal-card" onClick={(event) => event.stopPropagation()} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
            <h2 className="text-lg font-semibold text-slate-100">Umfrage erstellen</h2>
            <input
              className="glass-input mt-3 text-sm"
              placeholder="Frage"
              value={pollQuestion}
              onChange={(event) => setPollQuestion(event.target.value)}
              maxLength={160}
            />
            <div className="mt-3 space-y-2">
              {pollOptions.map((option, index) => (
                <div key={`poll-option-${index}`} className="flex items-center gap-2">
                  <input
                    className="glass-input text-sm"
                    placeholder={`Option ${index + 1}`}
                    value={option}
                    onChange={(event) =>
                      setPollOptions((prev) => prev.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
                    }
                    maxLength={120}
                  />
                  {pollOptions.length > 2 ? (
                    <button
                      className="btn-soft px-2 py-1 text-xs"
                      onClick={() => setPollOptions((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      X
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                className="btn-soft px-2 py-1 text-xs"
                onClick={() => setPollOptions((prev) => (prev.length >= 10 ? prev : [...prev, '']))}
              >
                + Option
              </button>
              <div className="flex gap-2">
                <button className="btn-soft px-2 py-1 text-xs" onClick={() => setShowPollModal(false)}>
                  Abbrechen
                </button>
                <button className="btn-primary px-2 py-1 text-xs" onClick={applyPollFromModal}>
                  Uebernehmen
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}

      {deleteTarget ? (
        <motion.div className="modal-overlay" onClick={() => setDeleteTarget(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <motion.div className="modal-card" onClick={(event) => event.stopPropagation()} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
            <h2 className="text-lg font-semibold text-slate-100">Nachricht loeschen</h2>
            <p className="surface-muted mt-2 text-sm">
              Du kannst diese Nachricht fuer dich loeschen
              {canDeleteForAll(deleteTarget) ? ' oder fuer alle Teilnehmer.' : '.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-soft" onClick={() => void deleteMessage('me')}>
                Fuer mich loeschen
              </button>
              {canDeleteForAll(deleteTarget) ? (
                <button className="btn-soft border-rose-500/40 text-rose-200" onClick={() => void deleteMessage('all')}>
                  Fuer alle loeschen
                </button>
              ) : null}
              <button className="btn-primary" onClick={() => setDeleteTarget(null)}>
                Abbrechen
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}

      {profileCard ? (
        <motion.div className="modal-overlay" onClick={() => setProfileCard(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <motion.div className="modal-card" onClick={(event) => event.stopPropagation()} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
            <div className="flex items-center gap-3">
              <Avatar user={profileCard} size={56} sessionToken={token} />
              <div>
                <h2 className="text-lg font-semibold text-slate-100">{profileCard.fullName}</h2>
                <p className="surface-muted text-sm">@{profileCard.username}</p>
                <span className={`mt-1 inline-flex ${roleBadgeClass(profileCard.role)}`}>{roleLabel(profileCard.role)}</span>
              </div>
            </div>

            <p className="mt-4 whitespace-pre-wrap text-sm text-slate-100">{profileCard.bio || 'Keine Bio gesetzt.'}</p>
            {profileCard.email ? <p className="surface-muted mt-2 text-xs">Email: {profileCard.email}</p> : null}

            <div className="mt-4 flex gap-2">
              <button className="btn-soft text-xs" onClick={() => void startDirect(profileCard.id)}>
                DM starten
              </button>
              {!profileCard.isFriend ? (
                <button className="btn-soft text-xs" onClick={() => void sendFriendRequest(profileCard.id)}>
                  Freund hinzufuegen
                </button>
              ) : null}
            </div>

            {me.role === 'superadmin' ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                <button className="btn-soft text-xs" onClick={() => void changeGlobalRole(profileCard.id, 'user')}>
                  set user
                </button>
                <button className="btn-soft text-xs" onClick={() => void changeGlobalRole(profileCard.id, 'admin')}>
                  set admin
                </button>
                <button className="btn-soft text-xs" onClick={() => void changeGlobalRole(profileCard.id, 'superadmin')}>
                  set superadmin
                </button>
              </div>
            ) : null}

            <button className="btn-soft mt-4 w-full" onClick={() => setProfileCard(null)}>
              Schliessen
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </>
  );
}

