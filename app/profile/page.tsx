'use client';

import Link from 'next/link';
import { CSSProperties, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AppBootstrap, AppNicknameSlot, AppUserProfile, ChatBackgroundPreset, GlobalRole, NicknameScope } from '@/types/social';

const TOKEN_KEY = 'chat_auth_token';
type ProfileWorkspaceTab = 'account' | 'social' | 'discover';
type SocialWorkspaceTab = 'friends' | 'requests' | 'discover';

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

async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
    image.src = url;
  });
}

async function renderAvatarBlob(input: {
  imageUrl: string;
  rotation: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  outputSize?: number;
}): Promise<Blob> {
  const image = await loadImageFromUrl(input.imageUrl);
  const outputSize = input.outputSize ?? 512;
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas-Kontext nicht verfügbar.');
  }

  const radians = (input.rotation * Math.PI) / 180;
  const safeSide = Math.ceil(Math.sqrt(outputSize * outputSize * 2));
  const baseScale = safeSide / Math.max(image.width, image.height);
  const drawWidth = image.width * baseScale * input.zoom;
  const drawHeight = image.height * baseScale * input.zoom;

  context.clearRect(0, 0, outputSize, outputSize);
  context.save();
  context.translate(outputSize / 2, outputSize / 2);
  context.beginPath();
  context.rect(-outputSize / 2, -outputSize / 2, outputSize, outputSize);
  context.clip();
  context.rotate(radians);
  context.drawImage(
    image,
    -drawWidth / 2 + input.offsetX,
    -drawHeight / 2 + input.offsetY,
    drawWidth,
    drawHeight
  );
  context.restore();

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Avatar konnte nicht gerendert werden.'));
        return;
      }
      resolve(blob);
    }, 'image/jpeg', 0.92);
  });
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
  const [activeTab, setActiveTab] = useState<ProfileWorkspaceTab>('account');
  const [activeSocialTab, setActiveSocialTab] = useState<SocialWorkspaceTab>('friends');
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [avatarEditorSource, setAvatarEditorSource] = useState('');
  const [avatarEditorFileName, setAvatarEditorFileName] = useState('avatar.jpg');
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarRotation, setAvatarRotation] = useState(0);
  const [avatarOffsetX, setAvatarOffsetX] = useState(0);
  const [avatarOffsetY, setAvatarOffsetY] = useState(0);
  const [avatarDragActive, setAvatarDragActive] = useState(false);

  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [profileHydrated, setProfileHydrated] = useState(false);
  const profileModalRef = useRef<HTMLDivElement | null>(null);
  const avatarEditorRef = useRef<HTMLDivElement | null>(null);
  const avatarEditorViewportRef = useRef<HTMLDivElement | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarDragOriginRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  const me = bootstrap?.me ?? null;
  const friends = bootstrap?.friends ?? [];
  const incoming = bootstrap?.incomingRequests ?? [];
  const outgoing = bootstrap?.outgoingRequests ?? [];
  const socialRequestCount = incoming.length + outgoing.length;
  const activeNicknameCount = nicknameSlots.filter((slot) => slot.nickname.trim()).length;
  const globalNicknamePreview =
    nicknameSlots.find((slot) => slot.scope === 'global' && slot.nickname.trim())?.nickname ||
    `${profileFirstName} ${profileLastName}`.trim() ||
    me?.fullName ||
    '';

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

  useEffect(() => {
    if (!avatarEditorOpen) {
      return;
    }
    const modal = avatarEditorRef.current;
    const focusable = modal?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    (focusable ?? modal)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (!avatarEditorRef.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAvatarEditor();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [avatarEditorOpen]);

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

  const closeAvatarEditor = () => {
    if (avatarEditorSource) {
      URL.revokeObjectURL(avatarEditorSource);
    }
    setAvatarEditorOpen(false);
    setAvatarEditorSource('');
    setAvatarEditorFileName('avatar.jpg');
    setAvatarZoom(1);
    setAvatarRotation(0);
    setAvatarOffsetX(0);
    setAvatarOffsetY(0);
    setAvatarDragActive(false);
    avatarDragOriginRef.current = null;
    if (avatarFileInputRef.current) {
      avatarFileInputRef.current.value = '';
    }
  };

  const openAvatarEditor = (file: File | null) => {
    if (!file) return;
    setError(null);
    setInfo(null);
    const nextUrl = URL.createObjectURL(file);
    if (avatarEditorSource) {
      URL.revokeObjectURL(avatarEditorSource);
    }
    setAvatarEditorSource(nextUrl);
    setAvatarEditorFileName(file.name || 'avatar.jpg');
    setAvatarZoom(1);
    setAvatarRotation(0);
    setAvatarOffsetX(0);
    setAvatarOffsetY(0);
    setAvatarEditorOpen(true);
  };

  const uploadAvatar = async (file: File | null) => {
    if (!token || !file) return;

    const formData = new FormData();
    formData.set('file', file);

    setIsBusy(true);
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
    } finally {
      setIsBusy(false);
    }
  };

  const saveEditedAvatar = async () => {
    if (!avatarEditorSource) {
      return;
    }
    try {
      const blob = await renderAvatarBlob({
        imageUrl: avatarEditorSource,
        rotation: avatarRotation,
        zoom: avatarZoom,
        offsetX: avatarOffsetX,
        offsetY: avatarOffsetY
      });
      const safeName = avatarEditorFileName.replace(/\.[^.]+$/, '') || 'avatar';
      const file = new File([blob], `${safeName}.jpg`, { type: 'image/jpeg' });
      await uploadAvatar(file);
      closeAvatarEditor();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Avatar-Bearbeitung fehlgeschlagen.');
    }
  };

  const beginAvatarDrag = (clientX: number, clientY: number) => {
    avatarDragOriginRef.current = {
      x: clientX,
      y: clientY,
      offsetX: avatarOffsetX,
      offsetY: avatarOffsetY
    };
    setAvatarDragActive(true);
  };

  const updateAvatarDrag = (clientX: number, clientY: number) => {
    const origin = avatarDragOriginRef.current;
    if (!origin) {
      return;
    }
    setAvatarOffsetX(origin.offsetX + (clientX - origin.x));
    setAvatarOffsetY(origin.offsetY + (clientY - origin.y));
  };

  const endAvatarDrag = () => {
    avatarDragOriginRef.current = null;
    setAvatarDragActive(false);
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
      <main className="w-full px-2 py-2 sm:px-3 sm:py-3">
        <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <section className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <div className="glass-panel overflow-hidden rounded-[1.75rem] p-0">
              <div className="relative border-b border-slate-800/70 p-5" style={profileHeroStyle(me)}>
                <div
                  className="pointer-events-none absolute inset-x-8 top-0 h-24 rounded-b-[999px] blur-3xl"
                  style={{ background: `radial-gradient(circle, ${hexToRgba(me.accentColor, 0.44)} 0%, transparent 72%)` }}
                />
                <div className="relative flex items-start gap-4">
                  <Avatar user={me} size={72} sessionToken={token} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="truncate text-2xl font-semibold text-slate-50" style={{ color: me.accentColor ?? '#f8fafc' }}>
                        {globalNicknamePreview}
                      </h1>
                      <span className={`inline-flex ${roleBadgeClass(me.role)}`} style={profileAccentStyle(me)}>
                        {roleLabel(me.role)}
                      </span>
                    </div>
                    <p className="surface-muted text-sm">@{me.username}</p>
                    <p className="mt-3 max-w-sm text-sm text-slate-100/90">{profileBio.trim() || 'Richte dein Profil so ein, wie andere dich im Chat wahrnehmen sollen.'}</p>
                    <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded-full border px-2.5 py-1 text-slate-100" style={{ borderColor: hexToRgba(profileAccentColor, 0.34), background: hexToRgba(profileAccentColor, 0.14) }}>
                        Theme {themeLabel(profileChatBackground)}
                      </span>
                      <span className="rounded-full border border-slate-700/70 bg-slate-950/45 px-2.5 py-1 text-slate-200">
                        {activeNicknameCount}/3 Nicknames aktiv
                      </span>
                      <span className="rounded-full border border-slate-700/70 bg-slate-950/45 px-2.5 py-1 text-slate-200">
                        {friends.length} Freunde
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-px bg-slate-900/60">
                <div className="bg-slate-950/55 px-4 py-3">
                  <p className="surface-muted text-[11px] uppercase tracking-wide">Akzent</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border border-white/25" style={{ background: profileAccentColor }} />
                    <span className="text-sm font-semibold text-slate-100">{profileAccentColor.toUpperCase()}</span>
                  </div>
                </div>
                <div className="bg-slate-950/55 px-4 py-3">
                  <p className="surface-muted text-[11px] uppercase tracking-wide">Social</p>
                  <p className="mt-2 text-sm font-semibold text-slate-100">{socialRequestCount} offene Anfragen</p>
                </div>
                <div className="bg-slate-950/55 px-4 py-3">
                  <p className="surface-muted text-[11px] uppercase tracking-wide">Status</p>
                  <p className="mt-2 text-sm font-semibold text-emerald-300">Bereit zum Speichern</p>
                </div>
              </div>

              <div className="p-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Link className="btn-soft text-center" href="/chat">
                    Zurück zum Chat
                  </Link>
                  <button className="btn-soft" onClick={() => void logout()}>
                    Abmelden
                  </button>
                </div>
              </div>
            </div>

            {error ? <p role="alert" aria-live="assertive" className="alert-error rounded-md px-3 py-2 text-sm">{error}</p> : null}
            {info ? <p role="status" aria-live="polite" className="alert-info rounded-md px-3 py-2 text-sm">{info}</p> : null}
          </section>

          <section className="min-w-0 space-y-4">
            <div className="glass-panel rounded-[1.5rem] p-3">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'account', label: 'Account', meta: 'Profil, Look, Nicknames' },
                  { id: 'social', label: 'Social', meta: 'Freunde und Anfragen' },
                  { id: 'discover', label: 'Entdecken', meta: 'Neue Kontakte finden' }
                ].map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className="min-w-[11rem] flex-1 rounded-2xl border px-4 py-3 text-left transition"
                      style={{
                        borderColor: isActive ? hexToRgba(profileAccentColor, 0.46) : 'rgba(71, 85, 105, 0.5)',
                        background: isActive
                          ? `linear-gradient(135deg, ${hexToRgba(profileAccentColor, 0.16)}, rgba(15, 23, 42, 0.86))`
                          : 'rgba(2, 6, 23, 0.38)',
                        boxShadow: isActive ? `0 0 0 1px ${hexToRgba(profileAccentColor, 0.16)} inset` : undefined
                      }}
                      onClick={() => setActiveTab(tab.id as ProfileWorkspaceTab)}
                    >
                      <p className="text-sm font-semibold text-slate-100">{tab.label}</p>
                      <p className="mt-1 text-xs text-slate-400">{tab.meta}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {activeTab === 'account' ? (
              <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)]">
                <div className="space-y-4">
                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-slate-100">Identity</h2>
                        <p className="surface-muted mt-1 text-sm">Basisdaten und public facing Profiltext.</p>
                      </div>
                      <button className="btn-soft text-sm" type="button" onClick={() => avatarFileInputRef.current?.click()}>
                        Avatar ändern
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="surface-muted mb-1 block text-xs uppercase tracking-wide">Vorname</span>
                        <input className="glass-input text-sm" placeholder="Vorname" value={profileFirstName} onChange={(event) => setProfileFirstName(event.target.value)} />
                      </label>
                      <label className="block">
                        <span className="surface-muted mb-1 block text-xs uppercase tracking-wide">Nachname</span>
                        <input className="glass-input text-sm" placeholder="Nachname" value={profileLastName} onChange={(event) => setProfileLastName(event.target.value)} />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="surface-muted mb-1 block text-xs uppercase tracking-wide">E-Mail</span>
                        <input className="glass-input text-sm" placeholder="E-Mail optional" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="surface-muted mb-1 block text-xs uppercase tracking-wide">Bio</span>
                        <textarea className="glass-input min-h-28 text-sm" placeholder="Kurz und stark. Das hier sehen andere in deinem Profil." value={profileBio} onChange={(event) => setProfileBio(event.target.value)} />
                      </label>
                    </div>
                  </div>

                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-slate-100">Nicknames</h2>
                        <p className="surface-muted mt-1 text-sm">Bis zu drei Namen, global oder gezielt pro Chat.</p>
                      </div>
                      <button
                        className="btn-soft px-3 py-2 text-sm"
                        type="button"
                        onClick={() =>
                          setNicknameSlots((prev) =>
                            prev.length >= 3 ? prev : [...prev, { nickname: '', scope: 'chat', chatId: bootstrap?.activeChatId ?? bootstrap?.chats[0]?.id ?? null }]
                          )
                        }
                      >
                        Slot hinzufügen
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {nicknameSlots.map((slot, index) => (
                        <div
                          key={slot.id ?? `nickname-slot-${index}`}
                          className="rounded-[1.3rem] border p-4"
                          style={{
                            borderColor: slot.scope === 'global' ? hexToRgba(profileAccentColor, 0.3) : 'rgba(148,163,184,0.2)',
                            background: slot.scope === 'global'
                              ? `linear-gradient(135deg, ${hexToRgba(profileAccentColor, 0.14)}, rgba(15,23,42,0.72))`
                              : 'rgba(2, 6, 23, 0.34)'
                          }}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-100">{slot.scope === 'global' ? 'Globaler Nickname' : 'Chat-spezifischer Nickname'}</p>
                              <p className="surface-muted mt-1 text-xs">
                                {slot.scope === 'global'
                                  ? 'Fallback für alle Bereiche ohne chat-spezifischen Namen.'
                                  : 'Gilt nur für den ausgewählten Chat.'}
                              </p>
                            </div>
                            <button className="btn-soft px-2 py-1 text-xs" type="button" onClick={() => setNicknameSlots((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}>
                              Entfernen
                            </button>
                          </div>

                          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                              <input
                                className="glass-input text-sm"
                                placeholder="Nickname"
                                value={slot.nickname}
                                onChange={(event) =>
                                  setNicknameSlots((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, nickname: event.target.value } : item)))
                                }
                              />
                              <div className="inline-flex rounded-2xl border border-slate-700/70 bg-slate-950/55 p-1">
                                <button
                                  type="button"
                                  className="rounded-xl px-3 py-2 text-xs font-semibold transition"
                                  style={{
                                    background: slot.scope === 'global' ? hexToRgba(profileAccentColor, 0.18) : 'transparent',
                                    color: slot.scope === 'global' ? profileAccentColor : '#cbd5e1'
                                  }}
                                  onClick={() =>
                                    setNicknameSlots((prev) =>
                                      prev.map((item, itemIndex) => (itemIndex === index ? { ...item, scope: 'global', chatId: null } : item))
                                    )
                                  }
                                >
                                  Global
                                </button>
                                <button
                                  type="button"
                                  className="rounded-xl px-3 py-2 text-xs font-semibold transition"
                                  style={{
                                    background: slot.scope === 'chat' ? hexToRgba(profileAccentColor, 0.18) : 'transparent',
                                    color: slot.scope === 'chat' ? profileAccentColor : '#cbd5e1'
                                  }}
                                  onClick={() =>
                                    setNicknameSlots((prev) =>
                                      prev.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, scope: 'chat', chatId: item.chatId ?? bootstrap?.activeChatId ?? bootstrap?.chats[0]?.id ?? null }
                                          : item
                                      )
                                    )
                                  }
                                >
                                  Pro Chat
                                </button>
                              </div>
                            </div>

                            <div className="flex min-h-[2.75rem] items-center justify-center rounded-2xl border border-slate-700/60 bg-slate-950/45 px-3 text-xs font-semibold text-slate-200">
                              {slot.nickname.trim() || 'Vorschau'}
                            </div>
                          </div>

                          {slot.scope === 'chat' ? (
                            <div className="mt-3">
                              <label className="block">
                                <span className="surface-muted mb-1 block text-xs uppercase tracking-wide">Ziel-Chat</span>
                                <select
                                  className="glass-input text-sm"
                                  value={slot.chatId ?? ''}
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
                              </label>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-slate-100">Look & Feel</h2>
                        <p className="surface-muted mt-1 text-sm">Akzentfarbe und Theme steuern deinen visuellen Auftritt.</p>
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

                    <div className="mt-4 grid gap-3 sm:grid-cols-[8rem_1fr]">
                      <label className="block">
                        <span className="surface-muted mb-1 block text-xs uppercase tracking-wide">Akzent</span>
                        <input className="glass-input h-12 text-sm" type="color" value={profileAccentColor} onChange={(event) => setProfileAccentColor(event.target.value)} />
                      </label>
                      <div className="rounded-[1.3rem] border p-4" style={{ borderColor: hexToRgba(profileAccentColor, 0.32), background: `linear-gradient(135deg, ${hexToRgba(profileAccentColor, 0.18)}, rgba(15,23,42,0.72))` }}>
                        <p className="text-sm font-semibold" style={{ color: profileAccentColor }}>
                          Vorschau: {globalNicknamePreview}
                        </p>
                        <p className="surface-muted mt-1 text-xs">@{me.username}</p>
                        <div className="mt-3 h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${profileAccentColor}, ${hexToRgba(profileAccentColor, 0.25)})` }} />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {BACKGROUND_PRESETS.map((preset) => (
                        <button
                          key={preset.value}
                          type="button"
                          className="rounded-[1.2rem] border p-4 text-left transition"
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

                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <h2 className="text-base font-semibold text-slate-100">Avatar & Save</h2>
                    <p className="surface-muted mt-1 text-sm">Bild austauschen, zuschneiden und Änderungen gesammelt speichern.</p>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Avatar user={me} size={62} sessionToken={token} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-100">{me.fullName}</p>
                        <p className="surface-muted text-xs">Avatar wird mit Cropper geöffnet und danach hochgeladen.</p>
                      </div>
                    </div>

                    <input
                      ref={avatarFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="file-input mt-4"
                      onChange={(event) => openAvatarEditor(event.target.files?.[0] ?? null)}
                    />

                    <button disabled={isBusy} className="btn-primary mt-4 w-full text-sm" onClick={() => void saveProfile()}>
                      {isBusy ? 'Speichere...' : 'Profil speichern'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === 'social' ? (
              <div className="space-y-4">
                <div className="glass-panel rounded-[1.5rem] p-3">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'friends', label: `Freunde (${friends.length})` },
                      { id: 'requests', label: `Anfragen (${socialRequestCount})` },
                      { id: 'discover', label: 'Kontakte finden' }
                    ].map((tab) => {
                      const isActive = activeSocialTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          className="rounded-2xl border px-4 py-2 text-sm font-semibold transition"
                          style={{
                            borderColor: isActive ? hexToRgba(profileAccentColor, 0.46) : 'rgba(71, 85, 105, 0.5)',
                            background: isActive ? hexToRgba(profileAccentColor, 0.14) : 'rgba(2, 6, 23, 0.28)',
                            color: isActive ? profileAccentColor : '#e2e8f0'
                          }}
                          onClick={() => setActiveSocialTab(tab.id as SocialWorkspaceTab)}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {activeSocialTab === 'friends' ? (
                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <h2 className="text-base font-semibold text-slate-100">Freunde</h2>
                    <p className="surface-muted mt-1 text-sm">Direkter Zugriff auf Profil, DM und Entfernen.</p>
                    <ul className="mt-4 grid gap-3 lg:grid-cols-2">
                      {friends.map((friend) => (
                        <li key={friend.id} className="glass-card rounded-[1.25rem] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <button className="flex min-w-0 items-center gap-3" onClick={() => void openProfile(friend.id)}>
                              <Avatar user={friend} size={34} sessionToken={token} />
                              <div className="min-w-0 text-left">
                                <p className="truncate text-sm font-semibold text-slate-100">{friend.fullName}</p>
                                <p className="truncate text-xs text-slate-400">@{friend.username}</p>
                              </div>
                            </button>
                            <div className="flex gap-2">
                              <button className="btn-soft px-2 py-1 text-xs" onClick={() => void startDirect(friend.id)}>
                                DM
                              </button>
                              <button className="btn-soft px-2 py-1 text-xs" onClick={() => void removeFriend(friend.id)}>
                                Entfernen
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                      {friends.length === 0 ? <li className="surface-muted text-sm">Noch keine Freunde.</li> : null}
                    </ul>
                  </div>
                ) : null}

                {activeSocialTab === 'requests' ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="glass-panel rounded-[1.5rem] p-5">
                      <h2 className="text-base font-semibold text-slate-100">Eingehend</h2>
                      <ul className="mt-4 space-y-3">
                        {incoming.map((request) => (
                          <li key={request.id} className="glass-card rounded-[1.2rem] p-3 text-sm">
                            <p className="font-semibold text-slate-100">{request.sender.fullName}</p>
                            <p className="surface-muted mt-1 text-xs">@{request.sender.username}</p>
                            <div className="mt-3 flex gap-2">
                              <button className="btn-soft px-3 py-1.5 text-xs" onClick={() => void respondFriend(request.id, 'accept')}>
                                Annehmen
                              </button>
                              <button className="btn-soft px-3 py-1.5 text-xs" onClick={() => void respondFriend(request.id, 'decline')}>
                                Ablehnen
                              </button>
                            </div>
                          </li>
                        ))}
                        {incoming.length === 0 ? <li className="surface-muted text-sm">Keine eingehenden Anfragen.</li> : null}
                      </ul>
                    </div>
                    <div className="glass-panel rounded-[1.5rem] p-5">
                      <h2 className="text-base font-semibold text-slate-100">Ausgehend</h2>
                      <ul className="mt-4 space-y-3">
                        {outgoing.map((request) => (
                          <li key={request.id} className="glass-card rounded-[1.2rem] p-3 text-sm">
                            <p className="font-semibold text-slate-100">{request.receiver.fullName}</p>
                            <p className="surface-muted mt-1 text-xs">Wartet auf Antwort</p>
                          </li>
                        ))}
                        {outgoing.length === 0 ? <li className="surface-muted text-sm">Keine ausgehenden Anfragen.</li> : null}
                      </ul>
                    </div>
                  </div>
                ) : null}

                {activeSocialTab === 'discover' ? (
                  <div className="glass-panel rounded-[1.5rem] p-5">
                    <h2 className="text-base font-semibold text-slate-100">Kontakte finden</h2>
                    <p className="surface-muted mt-1 text-sm">Suche neue Leute und starte direkt eine Unterhaltung.</p>
                    <input
                      className="glass-input mt-4 text-sm"
                      placeholder="Suche User"
                      value={discoverQuery}
                      onChange={(event) => setDiscoverQuery(event.target.value)}
                    />
                    <ul className="mt-4 grid gap-3 lg:grid-cols-2">
                      {discoverUsers.map((user) => (
                        <li key={user.id} className="glass-card rounded-[1.25rem] p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <button className="flex min-w-0 items-center gap-3" onClick={() => void openProfile(user.id)}>
                              <Avatar user={user} size={32} sessionToken={token} />
                              <div className="min-w-0 text-left">
                                <p className="truncate font-semibold text-slate-100">{user.fullName}</p>
                                <p className="truncate text-xs text-slate-400">@{user.username}</p>
                              </div>
                            </button>
                            <div className="flex gap-2">
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
                ) : null}
              </div>
            ) : null}

            {activeTab === 'discover' ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_20rem]">
                <div className="glass-panel rounded-[1.5rem] p-5">
                  <h2 className="text-base font-semibold text-slate-100">Discover</h2>
                  <p className="surface-muted mt-1 text-sm">Schnellansicht für Suche und neue Verbindungen.</p>
                  <input
                    className="glass-input mt-4 text-sm"
                    placeholder="Suche User"
                    value={discoverQuery}
                    onChange={(event) => setDiscoverQuery(event.target.value)}
                  />
                  <ul className="mt-4 space-y-3">
                    {discoverUsers.map((user) => (
                      <li key={user.id} className="glass-card rounded-[1.25rem] p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <button className="flex min-w-0 items-center gap-3" onClick={() => void openProfile(user.id)}>
                            <Avatar user={user} size={34} sessionToken={token} />
                            <div className="min-w-0 text-left">
                              <p className="truncate font-semibold text-slate-100">{user.fullName}</p>
                              <p className="truncate text-xs text-slate-400">@{user.username}</p>
                            </div>
                          </button>
                          <div className="flex gap-2">
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

                <div className="glass-panel rounded-[1.5rem] p-5">
                  <h2 className="text-base font-semibold text-slate-100">Quick Actions</h2>
                  <div className="mt-4 space-y-3">
                    <button className="btn-soft w-full text-sm" type="button" onClick={() => setActiveTab('account')}>
                      Profil weiter bearbeiten
                    </button>
                    <button className="btn-soft w-full text-sm" type="button" onClick={() => setActiveTab('social')}>
                      Zu Freunde & Anfragen
                    </button>
                    <button className="btn-primary w-full text-sm" type="button" disabled={isBusy} onClick={() => void saveProfile()}>
                      {isBusy ? 'Speichere...' : 'Aktuelle Änderungen speichern'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
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

      {avatarEditorOpen ? (
        <div className="modal-overlay" onClick={() => closeAvatarEditor()}>
          <div
            ref={avatarEditorRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="avatar-editor-title"
            tabIndex={-1}
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="avatar-editor-title" className="text-lg font-semibold text-slate-100">Profilbild bearbeiten</h2>
            <p className="surface-muted mt-1 text-sm">Wie bei WhatsApp: zuerst positionieren, zoomen und drehen, dann erst hochladen.</p>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="rounded-[1.5rem] border border-slate-800/80 bg-slate-950/70 p-4">
                <div
                  ref={avatarEditorViewportRef}
                  className="relative mx-auto aspect-square w-full max-w-[24rem] overflow-hidden rounded-[1.8rem] border border-slate-700/70 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.14),transparent_34%),linear-gradient(180deg,#111827_0%,#020617_100%)]"
                  onMouseDown={(event) => beginAvatarDrag(event.clientX, event.clientY)}
                  onMouseMove={(event) => {
                    if (avatarDragOriginRef.current) {
                      updateAvatarDrag(event.clientX, event.clientY);
                    }
                  }}
                  onMouseUp={() => endAvatarDrag()}
                  onMouseLeave={() => endAvatarDrag()}
                  onTouchStart={(event) => {
                    const touch = event.touches[0];
                    if (touch) {
                      beginAvatarDrag(touch.clientX, touch.clientY);
                    }
                  }}
                  onTouchMove={(event) => {
                    const touch = event.touches[0];
                    if (touch) {
                      updateAvatarDrag(touch.clientX, touch.clientY);
                    }
                  }}
                  onTouchEnd={() => endAvatarDrag()}
                  style={{ cursor: avatarDragActive ? 'grabbing' : 'grab' }}
                >
                  {avatarEditorSource ? (
                    <img
                      src={avatarEditorSource}
                      alt="Avatar-Vorschau"
                      draggable={false}
                      className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                      style={{
                        width: '140%',
                        height: '140%',
                        objectFit: 'contain',
                        transform: `translate(calc(-50% + ${avatarOffsetX}px), calc(-50% + ${avatarOffsetY}px)) scale(${avatarZoom}) rotate(${avatarRotation}deg)`,
                        transformOrigin: 'center center'
                      }}
                    />
                  ) : null}
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,transparent_54%,rgba(2,6,23,0.72)_55%)]" />
                  <div className="pointer-events-none absolute inset-[12%] rounded-full border border-white/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.35)]" />
                </div>
                <p className="surface-muted mt-3 text-center text-xs">Ziehen zum Verschieben. Das helle Kreisfenster ist dein finaler Avatar-Ausschnitt.</p>
              </div>

              <div className="space-y-3 rounded-[1.35rem] border border-slate-800/80 bg-slate-950/45 p-4">
                <div>
                  <label className="surface-muted mb-2 block text-xs font-semibold uppercase tracking-wide">Zoom</label>
                  <input
                    className="w-full accent-cyan-400"
                    type="range"
                    min="0.8"
                    max="2.6"
                    step="0.01"
                    value={avatarZoom}
                    onChange={(event) => setAvatarZoom(Number.parseFloat(event.target.value))}
                  />
                </div>
                <div>
                  <label className="surface-muted mb-2 block text-xs font-semibold uppercase tracking-wide">Horizontal</label>
                  <input
                    className="w-full accent-cyan-400"
                    type="range"
                    min="-220"
                    max="220"
                    step="1"
                    value={avatarOffsetX}
                    onChange={(event) => setAvatarOffsetX(Number.parseInt(event.target.value, 10) || 0)}
                  />
                </div>
                <div>
                  <label className="surface-muted mb-2 block text-xs font-semibold uppercase tracking-wide">Vertikal</label>
                  <input
                    className="w-full accent-cyan-400"
                    type="range"
                    min="-220"
                    max="220"
                    step="1"
                    value={avatarOffsetY}
                    onChange={(event) => setAvatarOffsetY(Number.parseInt(event.target.value, 10) || 0)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-soft text-sm" type="button" onClick={() => setAvatarRotation((prev) => prev - 90)}>
                    Links drehen
                  </button>
                  <button className="btn-soft text-sm" type="button" onClick={() => setAvatarRotation((prev) => prev + 90)}>
                    Rechts drehen
                  </button>
                </div>
                <button
                  className="btn-soft w-full text-sm"
                  type="button"
                  onClick={() => {
                    setAvatarZoom(1);
                    setAvatarRotation(0);
                    setAvatarOffsetX(0);
                    setAvatarOffsetY(0);
                  }}
                >
                  Zurücksetzen
                </button>
                <div className="rounded-2xl border border-slate-800/80 bg-slate-900/45 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Preview</p>
                  <div className="mt-3 flex items-center gap-3">
                    <div
                      className="h-16 w-16 overflow-hidden rounded-full border"
                      style={{ borderColor: hexToRgba(profileAccentColor, 0.42) }}
                    >
                      {avatarEditorSource ? (
                        <img
                          src={avatarEditorSource}
                          alt="Avatar-Preview"
                          draggable={false}
                          className="h-full w-full max-w-none select-none object-contain"
                          style={{
                            transform: `translate(${avatarOffsetX / 3}px, ${avatarOffsetY / 3}px) scale(${avatarZoom}) rotate(${avatarRotation}deg)`,
                            transformOrigin: 'center center'
                          }}
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">{me.fullName}</p>
                      <p className="surface-muted text-xs">@{me.username}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-primary text-sm" type="button" disabled={isBusy} onClick={() => void saveEditedAvatar()}>
                {isBusy ? 'Speichere...' : 'Zuschneiden und hochladen'}
              </button>
              <button className="btn-soft text-sm" type="button" disabled={isBusy} onClick={() => closeAvatarEditor()}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
