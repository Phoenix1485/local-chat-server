'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AppBootstrap, AppUserProfile, GlobalRole } from '@/types/social';

const TOKEN_KEY = 'chat_auth_token';

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
          email: profileEmail
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
                <h1 className="truncate text-xl font-semibold text-slate-100">{me.fullName}</h1>
                <p className="surface-muted text-sm">@{me.username}</p>
                <span className={`mt-1 inline-flex ${roleBadgeClass(me.role)}`}>{roleLabel(me.role)}</span>
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
            <div className="flex items-center gap-3">
              <Avatar user={profileCard} size={56} sessionToken={token} />
              <div>
                <h2 id="profile-card-title" className="text-lg font-semibold text-slate-100">{profileCard.fullName}</h2>
                <p className="surface-muted text-sm">@{profileCard.username}</p>
                <span className={`mt-1 inline-flex ${roleBadgeClass(profileCard.role)}`}>{roleLabel(profileCard.role)}</span>
              </div>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm text-slate-100">{profileCard.bio || 'Keine Bio gesetzt.'}</p>
            {profileCard.email ? <p className="surface-muted mt-2 text-xs">E-Mail: {profileCard.email}</p> : null}

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

