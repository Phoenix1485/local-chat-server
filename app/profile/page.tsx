'use client';

import Link from 'next/link';
import { CSSProperties, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AppBootstrap, AppNicknameSlot, AppUserProfile, ChatBackgroundPreset, GlobalRole, NicknameScope } from '@/types/social';

const TOKEN_KEY = 'chat_auth_token';
const BACKGROUND_PRESETS: Array<{ value: ChatBackgroundPreset; label: string }> = [
  { value: 'aurora', label: 'Aurora' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'midnight', label: 'Midnight' },
  { value: 'forest', label: 'Forest' },
  { value: 'paper', label: 'Paper' }
];

function hexToRgba(hex: string | undefined, alpha: number): string {
  const normalized = (hex ?? '').trim();
  const match = /^#([0-9a-fA-F]{6})$/.exec(normalized);
  if (!match) {
    return `rgba(56, 189, 248, ${alpha})`;
  }
  const value = match[1];
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function profileThemePreviewStyle(preset: ChatBackgroundPreset): CSSProperties {
  if (preset === 'sunset') {
    return { background: 'radial-gradient(circle at top, rgba(251,146,60,0.3), transparent 38%), linear-gradient(180deg, #3b2434 0%, #1f2937 100%)' };
  }
  if (preset === 'midnight') {
    return { background: 'radial-gradient(circle at top right, rgba(96,165,250,0.22), transparent 32%), linear-gradient(180deg, #111827 0%, #020617 100%)' };
  }
  if (preset === 'forest') {
    return { background: 'radial-gradient(circle at top, rgba(74,222,128,0.25), transparent 35%), linear-gradient(180deg, #16281d 0%, #0b1410 100%)' };
  }
  if (preset === 'paper') {
    return { background: 'linear-gradient(180deg, #243244 0%, #111827 100%)' };
  }
  return { background: 'radial-gradient(circle at top, rgba(34,211,238,0.26), transparent 35%), linear-gradient(180deg, #1a2740 0%, #0f172a 100%)' };
}

function profileAccentStyle(user: AppUserProfile | null | undefined): CSSProperties | undefined {
  if (!user?.accentColor) {
    return undefined;
  }
  return {
    color: user.accentColor,
    borderColor: hexToRgba(user.accentColor, 0.34),
    background: hexToRgba(user.accentColor, 0.14)
  };
}

function profileHeroStyle(user: AppUserProfile | null | undefined): CSSProperties {
  const accent = user?.accentColor ?? '#38bdf8';
  return {
    ...profileThemePreviewStyle(user?.chatBackground ?? 'aurora'),
    borderColor: hexToRgba(accent, 0.34),
    boxShadow: `0 18px 42px ${hexToRgba(accent, 0.14)}`,
    position: 'relative',
    overflow: 'hidden'
  };
}

function themeLabel(preset?: ChatBackgroundPreset): string {
  if (preset === 'sunset') return 'Sunset';
  if (preset === 'midnight') return 'Midnight';
  if (preset === 'forest') return 'Forest';
  if (preset === 'paper') return 'Paper';
  return 'Aurora';
}

function initials(user: Pick<AppUserProfile, 'firstName' | 'lastName' | 'username'>): string {
  const a = user.firstName?.[0] ?? '';
  const b = user.lastName?.[0] ?? '';
  const value = `${a}${b}`.trim();
  return value || user.username.slice(0, 2).toUpperCase();
}

function avatarUrl(user: Pick<AppUserProfile, 'id' | 'avatarUpdatedAt'>, sessionToken?: string): string {
  const version = user.avatarUpdatedAt ?? 0;
  const tokenQuery = sessionToken ? `&sessionToken=${encodeURIComponent(sessionToken)}` : '';
  return `/api/app/profile/avatar/${encodeURIComponent(user.id)}?v=${version}${tokenQuery}`;
}

function roleLabel(role: GlobalRole): string {
  if (role === 'superadmin') return 'Superadmin';
  if (role === 'admin') return 'Admin';
  return 'Nutzer';
}

function roleBadgeClass(role: GlobalRole): string {
  if (role === 'superadmin') return 'role-badge role-badge-super';
  if (role === 'admin') return 'role-badge role-badge-admin';
  return 'role-badge role-badge-user';
}

function Avatar({ user, size = 34, sessionToken }: { user: AppUserProfile; size?: number; sessionToken?: string }) {
  const [failed, setFailed] = useState(false);
  const accent = user.accentColor ?? '#38bdf8';

  if (!user.avatarUpdatedAt || failed) {
    return (
      <div
        className="flex items-center justify-center rounded-full text-xs font-semibold text-cyan-100"
        style={{
          width: size,
          height: size,
          border: `1px solid ${hexToRgba(accent, 0.45)}`,
          background: `linear-gradient(145deg, ${hexToRgba(accent, 0.28)}, ${hexToRgba(accent, 0.14)})`,
          boxShadow: `0 0 0 1px ${hexToRgba(accent, 0.12)} inset`
        }}
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
      className="rounded-full object-cover"
      style={{
        border: `1px solid ${hexToRgba(accent, 0.42)}`,
        boxShadow: `0 0 0 1px ${hexToRgba(accent, 0.12)} inset`
      }}
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
    const message = payload && typeof payload === 'object' && 'error' in payload ? String(payload.error) : 'Anfrage fehlgeschlagen.';
    throw new Error(message);
  }

  return payload;
}

export default function ProfilePage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [bootstrap, setBootstrap] = useState<AppBootstrap | null>(null);
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [discoverUsers, setDiscoverUsers] = useState<AppUserProfile[]>([]);
  const [profileCard, setProfileCard] = useState<AppUserProfile | null>(null);

  const [profileFirstName, setProfileFirstName] = useState('');
  const [profileLastName, setProfileLastName] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileAccentColor, setProfileAccentColor] = useState('#38bdf8');
  const [profileChatBackground, setProfileChatBackground] = useState<ChatBackgroundPreset>('aurora');
  const [nicknameSlots, setNicknameSlots] = useState<Array<{ id?: string; nickname: string; scope: NicknameScope; chatId: string | null }>>([
    { nickname: '', scope: 'global', chatId: null }
  ]);

  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [profileHydrated, setProfileHydrated] = useState(false);
  const profileModalRef = useRef<HTMLDivElement | null>(null);

  const me = bootstrap?.me ?? null;
  const friends = bootstrap?.friends ?? [];
  const incoming = bootstrap?.incomingRequests ?? [];
  const outgoing = bootstrap?.outgoingRequests ?? [];

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY) ?? '';
    if (!stored) {
      router.replace('/');
      return;
    }

    setToken(stored);
  }, [router]);

  const loadBootstrap = async (currentToken: string, chatId?: string) => {
    const query = chatId ? `?chatId=${encodeURIComponent(chatId)}` : '';
    const payload = (await api(`/api/app/bootstrap${query}`, currentToken)) as AppBootstrap;
    setBootstrap(payload);

    if (!profileHydrated) {
      setProfileFirstName(payload.me.firstName);
      setProfileLastName(payload.me.lastName);
      setProfileBio(payload.me.bio ?? '');
      setProfileEmail(payload.me.email ?? '');
      setProfileAccentColor(payload.me.accentColor ?? '#38bdf8');
      setProfileChatBackground(payload.me.chatBackground ?? 'aurora');
      setNicknameSlots(
        (payload.me.nicknameSlots?.length
          ? payload.me.nicknameSlots
          : [{ nickname: '', scope: 'global', chatId: null } as AppNicknameSlot]
        ).map((slot) => ({
          id: slot.id,
          nickname: slot.nickname,
          scope: slot.scope,
          chatId: slot.chatId
        }))
      );
      setProfileHydrated(true);
    }

    return payload;
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    void loadBootstrap(token).catch(() => {
      localStorage.removeItem(TOKEN_KEY);
      router.replace('/');
    });
  }, [token, router]);

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
    if (!profileCard) {
      return;
    }
    const modal = profileModalRef.current;
    const focusable = modal?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    (focusable ?? modal)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (!profileModalRef.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setProfileCard(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = Array.from(profileModalRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute('disabled'));
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [profileCard]);

  const saveProfile = async () => {
    if (!token) return;
    setIsBusy(true);
    setError(null);
    setInfo(null);

    try {
      const payload = (await api('/api/app/profile/me', token, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: profileFirstName,
          lastName: profileLastName,
          bio: profileBio,
          email: profileEmail,
          accentColor: profileAccentColor,
          chatBackground: profileChatBackground,
          nicknameSlots: nicknameSlots
            .map((slot) => ({
              id: slot.id ?? null,
              nickname: slot.nickname.trim(),
              scope: slot.scope,
              chatId: slot.scope === 'chat' ? slot.chatId : null
            }))
            .filter((slot) => slot.nickname.length > 0)
        })
      })) as { profile: AppUserProfile };

      setBootstrap((prev) => (prev ? { ...prev, me: payload.profile } : prev));
      setInfo('Profil gespeichert.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Profilupdate fehlgeschlagen.');
    } finally {
      setIsBusy(false);
    }
  };

  const uploadAvatar = async (file: File | null) => {
    if (!token || !file) return;

    const formData = new FormData();
    formData.set('file', file);

    setError(null);
    setInfo(null);

    try {
      await api('/api/app/profile/avatar', token, {
        method: 'POST',
        body: formData
      });
      await loadBootstrap(token);
      setInfo('Profilbild aktualisiert.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Avatar-Upload fehlgeschlagen.');
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
      await loadBootstrap(token);
      if (profileCard?.id === targetUserId) {
        await openProfile(targetUserId);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Rollenwechsel fehlgeschlagen.');
    }
  };

  const startDirect = async (targetUserId: string) => {
    if (!token) return;

    try {
      const payload = (await api('/api/app/chats/direct', token, {
        method: 'POST',
        body: JSON.stringify({ targetUserId })
      })) as { chat: { id: string } };

      router.push(`/chat?chatId=${encodeURIComponent(payload.chat.id)}`);
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
      await loadBootstrap(token);
      setInfo('Freundschaftsanfrage gesendet.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Freundschaftsanfrage fehlgeschlagen.');
    }
  };

  const respondFriend = async (requestId: string, action: 'accept' | 'decline') => {
    if (!token) return;

    try {
      await api('/api/app/friends/respond', token, {
        method: 'POST',
        body: JSON.stringify({ requestId, action })
      });
      await loadBootstrap(token);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Aktion fehlgeschlagen.');
    }
  };

  const removeFriend = async (targetUserId: string) => {
    if (!token) return;

    try {
      await api('/api/app/friends/remove', token, {
        method: 'POST',
        body: JSON.stringify({ targetUserId })
      });
      await loadBootstrap(token);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Freund entfernen fehlgeschlagen.');
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
      <main className="py-4">
        <section className="glass-panel rounded-2xl p-6">
          <p className="surface-muted text-sm">Lade Profil...</p>
        </section>
      </main>
    );
  }

  return (
    <>
      <main className="profile-shell py-2 sm:py-3">
        <section className="profile-column">
          <div className="glass-panel rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <Avatar user={me} size={58} sessionToken={token} />
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold text-slate-100" style={{ color: me.accentColor ?? '#f8fafc' }}>{me.fullName}</h1>
                <p className="surface-muted text-sm">@{me.username}</p>
                <span className={`mt-1 inline-flex ${roleBadgeClass(me.role)}`} style={profileAccentStyle(me)}>{roleLabel(me.role)}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Link className="btn-soft text-center" href="/chat">
                Zurück zum Chat
              </Link>
              <button className="btn-soft" onClick={() => void logout()}>
                Abmelden
              </button>
            </div>
          </div>

          <div className="glass-panel mt-3 rounded-2xl p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-200">Mein Profil</h2>
            <div className="mt-3 space-y-2">
              <input className="glass-input text-sm" placeholder="Vorname" value={profileFirstName} onChange={(event) => setProfileFirstName(event.target.value)} />
              <input className="glass-input text-sm" placeholder="Nachname" value={profileLastName} onChange={(event) => setProfileLastName(event.target.value)} />
              <input className="glass-input text-sm" placeholder="E-Mail optional" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} />
              <textarea className="glass-input min-h-24 text-sm" placeholder="Bio" value={profileBio} onChange={(event) => setProfileBio(event.target.value)} />
              <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-200">Stil</h3>
                    <p className="surface-muted mt-1 text-xs">Akzentfarbe und Hintergrund bestimmen dein Profil- und Chatgefühl.</p>
                  </div>
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl text-xs font-semibold text-white"
                    style={{
                      background: `linear-gradient(145deg, ${hexToRgba(profileAccentColor, 0.9)}, ${hexToRgba(profileAccentColor, 0.55)})`,
                      boxShadow: `0 12px 26px ${hexToRgba(profileAccentColor, 0.28)}`
                    }}
                  >
                    {me.username.slice(0, 2).toUpperCase()}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr]">
                  <label className="block">
                    <span className="surface-muted mb-1 block text-xs uppercase tracking-wide">Akzentfarbe</span>
                    <input className="glass-input h-12 text-sm" type="color" value={profileAccentColor} onChange={(event) => setProfileAccentColor(event.target.value)} />
                  </label>
                  <div className="rounded-2xl border p-3" style={{ borderColor: hexToRgba(profileAccentColor, 0.32), background: `linear-gradient(135deg, ${hexToRgba(profileAccentColor, 0.18)}, rgba(15,23,42,0.72))` }}>
                    <p className="text-sm font-semibold" style={{ color: profileAccentColor }}>Vorschau: {nicknameSlots.find((slot) => slot.scope === 'global' && slot.nickname.trim())?.nickname || `${profileFirstName} ${profileLastName}`.trim() || me.fullName}</p>
                    <p className="surface-muted mt-1 text-xs">@{me.username}</p>
                    <div className="mt-3 h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${profileAccentColor}, ${hexToRgba(profileAccentColor, 0.25)})` }} />
                  </div>
                </div>
                <div className="mt-3">
                  <span className="surface-muted mb-2 block text-xs uppercase tracking-wide">Chat-Hintergrund</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {BACKGROUND_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        className="rounded-2xl border p-3 text-left"
                        style={{
                          ...profileThemePreviewStyle(preset.value),
                          borderColor: profileChatBackground === preset.value ? hexToRgba(profileAccentColor, 0.46) : 'rgba(148,163,184,0.18)',
                          boxShadow: profileChatBackground === preset.value ? `0 0 0 1px ${hexToRgba(profileAccentColor, 0.24)} inset` : undefined
                        }}
                        onClick={() => setProfileChatBackground(preset.value)}
                      >
                        <p className="text-sm font-semibold text-slate-100">{preset.label}</p>
                        <p className="mt-1 text-xs text-slate-300">Persönlicher Bühnenlook für deinen Chat.</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-200">Nicknames</h3>
                  <button
                    className="btn-soft px-2 py-1 text-xs"
                    onClick={() =>
                      setNicknameSlots((prev) =>
                        prev.length >= 3 ? prev : [...prev, { nickname: '', scope: 'chat', chatId: bootstrap?.activeChatId ?? bootstrap?.chats[0]?.id ?? null }]
                      )
                    }
                  >
                    Slot hinzufügen
                  </button>
                </div>
                <p className="surface-muted mt-1 text-xs">Maximal 3 aktive Nicknames. Global oder gezielt pro Chat.</p>
                <div className="mt-3 space-y-3">
                  {nicknameSlots.map((slot, index) => (
                    <div
                      key={slot.id ?? `nickname-slot-${index}`}
                      className="rounded-2xl border p-3"
                      style={{
                        borderColor: slot.scope === 'global' ? hexToRgba(profileAccentColor, 0.3) : 'rgba(148,163,184,0.2)',
                        background: slot.scope === 'global'
                          ? `linear-gradient(135deg, ${hexToRgba(profileAccentColor, 0.14)}, rgba(15,23,42,0.72))`
                          : 'rgba(2, 6, 23, 0.32)'
                      }}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{slot.scope === 'global' ? 'Globaler Nickname' : 'Chat-spezifischer Nickname'}</p>
                          <p className="surface-muted text-xs">
                            {slot.scope === 'global'
                              ? 'Wird überall angezeigt, wenn kein Chat-Nickname greift.'
                              : 'Überschreibt deinen globalen Namen nur im gewählten Chat.'}
                          </p>
                        </div>
                        <button
                          className="btn-soft px-2 py-1 text-xs"
                          onClick={() => setNicknameSlots((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                        >
                          Entfernen
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[1fr_140px_1fr_auto]">
                        <input
                          className="glass-input text-sm"
                          placeholder="Nickname"
                          value={slot.nickname}
                          onChange={(event) =>
                            setNicknameSlots((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, nickname: event.target.value } : item)))
                          }
                        />
                        <select
                          className="glass-input text-sm"
                          value={slot.scope}
                          onChange={(event) =>
                            setNicknameSlots((prev) =>
                              prev.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      scope: event.target.value as NicknameScope,
                                      chatId: event.target.value === 'global' ? null : item.chatId ?? bootstrap?.activeChatId ?? bootstrap?.chats[0]?.id ?? null
                                    }
                                  : item
                              )
                            )
                          }
                        >
                          <option value="global">Global</option>
                          <option value="chat">Pro Chat</option>
                        </select>
                        <select
                          className="glass-input text-sm"
                          value={slot.chatId ?? ''}
                          disabled={slot.scope !== 'chat'}
                          onChange={(event) =>
                            setNicknameSlots((prev) =>
                              prev.map((item, itemIndex) => (itemIndex === index ? { ...item, chatId: event.target.value || null } : item))
                            )
                          }
                        >
                          <option value="">Chat wählen</option>
                          {(bootstrap?.chats ?? []).map((chat) => (
                            <option key={chat.id} value={chat.id}>
                              {chat.name}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center justify-center rounded-xl border border-slate-700/60 bg-slate-950/45 px-2 text-xs font-semibold text-slate-200">
                          {slot.nickname.trim() || 'Vorschau'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="file-input" onChange={(event) => void uploadAvatar(event.target.files?.[0] ?? null)} />
              <button disabled={isBusy} className="btn-primary w-full text-sm" onClick={() => void saveProfile()}>
                {isBusy ? 'Speichere...' : 'Profil speichern'}
              </button>
            </div>
          </div>

          {error ? <p role="alert" aria-live="assertive" className="alert-error mt-3 rounded-md px-3 py-2 text-sm">{error}</p> : null}
          {info ? <p role="status" aria-live="polite" className="alert-info mt-3 rounded-md px-3 py-2 text-sm">{info}</p> : null}
        </section>

        <section className="profile-column">
          <div className="glass-panel rounded-2xl p-4">
            <h2 className="surface-muted text-xs font-semibold uppercase tracking-wide">Freunde ({friends.length})</h2>
            <ul className="mt-2 max-h-80 space-y-1.5 overflow-y-auto">
              {friends.map((friend) => (
                <li key={friend.id} className="glass-card rounded-lg p-2">
                  <div className="flex items-center justify-between gap-2">
                    <button className="flex min-w-0 items-center gap-2" onClick={() => void openProfile(friend.id)}>
                      <Avatar user={friend} size={26} sessionToken={token} />
                      <span className="truncate text-sm text-slate-100">{friend.fullName}</span>
                    </button>
                    <div className="flex gap-1">
                      <button className="btn-soft px-2 py-1 text-xs" onClick={() => void startDirect(friend.id)}>
                        DM
                      </button>
                      <button className="btn-soft px-2 py-1 text-xs" onClick={() => void removeFriend(friend.id)}>
                        X
                      </button>
                    </div>
                  </div>
                </li>
              ))}
              {friends.length === 0 ? <li className="surface-muted text-sm">Noch keine Freunde.</li> : null}
            </ul>
          </div>

          <div className="glass-panel mt-3 rounded-2xl p-4">
            <h2 className="surface-muted text-xs font-semibold uppercase tracking-wide">Anfragen</h2>
            <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
              {incoming.map((request) => (
                <li key={request.id} className="glass-card rounded-lg p-2 text-sm">
                  <p>{request.sender.fullName}</p>
                  <div className="mt-2 flex gap-2">
                    <button className="btn-soft px-2 py-1 text-xs" onClick={() => void respondFriend(request.id, 'accept')}>
                      Annehmen
                    </button>
                    <button className="btn-soft px-2 py-1 text-xs" onClick={() => void respondFriend(request.id, 'decline')}>
                      Ablehnen
                    </button>
                  </div>
                </li>
              ))}
              {outgoing.map((request) => (
                <li key={request.id} className="glass-card rounded-lg p-2 text-sm">
                  <p className="surface-muted">Ausgehend: {request.receiver.fullName}</p>
                </li>
              ))}
              {incoming.length === 0 && outgoing.length === 0 ? (
                <li className="surface-muted text-sm">Keine offenen Anfragen.</li>
              ) : null}
            </ul>
          </div>
        </section>

        <section className="profile-column">
          <div className="glass-panel rounded-2xl p-4">
            <h2 className="surface-muted text-xs font-semibold uppercase tracking-wide">Entdecken</h2>
            <input
              className="glass-input mt-2 text-sm"
              placeholder="Suche User"
              value={discoverQuery}
              onChange={(event) => setDiscoverQuery(event.target.value)}
            />
            <ul className="mt-2 max-h-[34rem] space-y-1.5 overflow-y-auto">
              {discoverUsers.map((user) => (
                <li key={user.id} className="glass-card rounded-lg p-2 text-sm">
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
                          Hinzufügen
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
              {discoverUsers.length === 0 ? <li className="surface-muted text-sm">Keine Treffer.</li> : null}
            </ul>
          </div>
        </section>
      </main>

      {profileCard ? (
        <div className="modal-overlay" onClick={() => setProfileCard(null)}>
          <div ref={profileModalRef} role="dialog" aria-modal="true" aria-labelledby="profile-card-title" tabIndex={-1} className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="rounded-[1.35rem] border p-4" style={profileHeroStyle(profileCard)}>
              <div
                className="pointer-events-none absolute inset-x-6 top-0 h-20 rounded-b-[999px] blur-2xl"
                style={{ background: `radial-gradient(circle, ${hexToRgba(profileCard.accentColor, 0.4)} 0%, transparent 72%)` }}
              />
              <div className="relative flex items-start gap-3">
                <Avatar user={profileCard} size={64} sessionToken={token} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 id="profile-card-title" className="truncate text-xl font-semibold text-slate-100" style={{ color: profileCard.accentColor ?? '#f8fafc' }}>
                      {profileCard.fullName}
                    </h2>
                    <span className={`inline-flex ${roleBadgeClass(profileCard.role)}`} style={profileAccentStyle(profileCard)}>
                      {roleLabel(profileCard.role)}
                    </span>
                  </div>
                  <p className="surface-muted text-sm">@{profileCard.username}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <span
                      className="rounded-full border px-2 py-1 font-semibold uppercase tracking-wide text-slate-100"
                      style={{
                        borderColor: hexToRgba(profileCard.accentColor, 0.34),
                        background: hexToRgba(profileCard.accentColor, 0.14)
                      }}
                    >
                      Theme {themeLabel(profileCard.chatBackground)}
                    </span>
                    {profileCard.legalName ? (
                      <span className="rounded-full border border-slate-700/70 bg-slate-950/45 px-2 py-1 text-slate-200">
                        Legal {profileCard.legalName}
                      </span>
                    ) : null}
                    {profileCard.nicknameSlots?.filter((slot) => slot.nickname.trim()).slice(0, 3).map((slot) => (
                      <span
                        key={slot.id}
                        className="rounded-full border px-2 py-1 text-slate-100"
                        style={{
                          borderColor: hexToRgba(profileCard.accentColor, slot.scope === 'global' ? 0.34 : 0.22),
                          background: slot.scope === 'global' ? hexToRgba(profileCard.accentColor, 0.14) : 'rgba(15, 23, 42, 0.55)'
                        }}
                      >
                        {slot.scope === 'global' ? 'Global' : slot.chatName ?? 'Chat'}: {slot.nickname}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_0.9fr]">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/45 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Profil</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-100">{profileCard.bio || 'Keine Bio gesetzt.'}</p>
                {profileCard.email ? <p className="surface-muted mt-3 text-xs">E-Mail: {profileCard.email}</p> : null}
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/45 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Look & Feel</p>
                <div className="mt-3 rounded-2xl border p-3" style={profileHeroStyle(profileCard)}>
                  <p className="text-sm font-semibold" style={{ color: profileCard.accentColor ?? '#f8fafc' }}>
                    {profileCard.nicknameSlots?.find((slot) => slot.scope === 'global' && slot.nickname.trim())?.nickname || profileCard.fullName}
                  </p>
                  <p className="surface-muted text-xs">@{profileCard.username}</p>
                  <div
                    className="mt-3 h-2 rounded-full"
                    style={{ background: `linear-gradient(90deg, ${profileCard.accentColor ?? '#38bdf8'}, ${hexToRgba(profileCard.accentColor, 0.2)})` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button className="btn-soft text-xs" onClick={() => void startDirect(profileCard.id)}>
                DM starten
              </button>
              {!profileCard.isFriend ? (
                <button className="btn-soft text-xs" onClick={() => void sendFriendRequest(profileCard.id)}>
                  Freund hinzufügen
                </button>
              ) : null}
            </div>

            {me.role === 'superadmin' ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                <button className="btn-soft text-xs" onClick={() => void changeGlobalRole(profileCard.id, 'user')}>
                  Als Nutzer setzen
                </button>
                <button className="btn-soft text-xs" onClick={() => void changeGlobalRole(profileCard.id, 'admin')}>
                  Als Admin setzen
                </button>
                <button className="btn-soft text-xs" onClick={() => void changeGlobalRole(profileCard.id, 'superadmin')}>
                  Als Superadmin setzen
                </button>
              </div>
            ) : null}

            <button className="btn-soft mt-4 w-full" onClick={() => setProfileCard(null)}>
              Schliessen
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
