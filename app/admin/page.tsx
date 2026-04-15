'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminBlacklistEntry, AdminIpBlacklistEntry, AdminSnapshot } from '@/types/chat';
import { StatusPill } from '@/components/StatusPill';

export default function AdminPage() {
  const [adminTokenInput, setAdminTokenInput] = useState('');
  const [activeToken, setActiveToken] = useState('');
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [blacklistKind, setBlacklistKind] = useState<'name' | 'email'>('name');
  const [blacklistValue, setBlacklistValue] = useState('');
  const [blacklistNote, setBlacklistNote] = useState('');
  const [ipValue, setIpValue] = useState('');
  const [ipNote, setIpNote] = useState('');
  const [ipScope, setIpScope] = useState({
    forbidRegister: true,
    forbidLogin: true,
    forbidReset: true,
    forbidChat: true,
    terminateSessions: true
  });
  const [passwordTargetUserId, setPasswordTargetUserId] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [revokePasswordSessions, setRevokePasswordSessions] = useState(true);

  const fetchSnapshot = useCallback(async (token: string): Promise<AdminSnapshot> => {
    const response = await fetch('/api/admin/state', {
      headers: {
        'x-admin-token': token
      },
      cache: 'no-store'
    });

    const contentType = response.headers.get('content-type') ?? '';
    const payload =
      contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : null;

    if (!response.ok) {
      const serverError =
        payload && typeof payload === 'object' && 'error' in payload ? String(payload.error) : null;
      if (response.status === 401) {
        throw new Error(
          serverError ?? 'Nicht autorisiert. Token ist ungültig/abgelaufen oder Vercel ADMIN_KEY passt nicht.'
        );
      }
      throw new Error(serverError ?? `Admin-Status konnte nicht geladen werden (${response.status}).`);
    }

    if (!payload || typeof payload !== 'object') {
      throw new Error('Admin-Statusantwort ungültig.');
    }

    return payload as AdminSnapshot;
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('chat_admin_token') ?? '';
    const normalized = stored.trim();
    setAdminTokenInput(normalized);
    setActiveToken(normalized);
  }, []);

  useEffect(() => {
    if (!activeToken) {
      setSnapshot(null);
      setError(null);
      setIsConnecting(false);
      return;
    }

    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stream: EventSource | null = null;

    const applySnapshot = (next: AdminSnapshot) => {
      setSnapshot(next);
      setError(null);
      setIsConnecting(false);
    };

    const loadSnapshot = async () => {
      try {
        const next = await fetchSnapshot(activeToken);
        if (!closed) {
          applySnapshot(next);
        }
      } catch (requestError) {
        if (!closed) {
          setSnapshot(null);
          setError(requestError instanceof Error ? requestError.message : 'Admin-Status konnte nicht geladen werden.');
          setIsConnecting(false);
        }
      }
    };

    const openStream = () => {
      if (closed) {
        return;
      }

      stream?.close();
      stream = new EventSource(`/api/admin/stream?adminToken=${encodeURIComponent(activeToken)}`);

      stream.addEventListener('snapshot', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as AdminSnapshot;
          applySnapshot(payload);
        } catch {
          setError('Admin-Status konnte nicht verarbeitet werden.');
        }
      });

      stream.onerror = () => {
        if (closed) {
          return;
        }
        setError('Admin-Stream getrennt. Verbindung wird neu aufgebaut...');
        stream?.close();
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            openStream();
          }, 1500);
        }
      };
    };

    setIsConnecting(true);
    void loadSnapshot();

    openStream();
    const pollTimer = setInterval(() => {
      void loadSnapshot();
    }, 2500);

    return () => {
      closed = true;
      stream?.close();
      clearInterval(pollTimer);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [activeToken, fetchSnapshot]);

  const pendingUsers = snapshot?.pending ?? [];
  const approvedUsers = snapshot?.approved ?? [];
  const rejectedUsers = snapshot?.rejected ?? [];
  const recentMessages = snapshot?.recentMessages ?? [];
  const activeChats = snapshot?.activeChats ?? [];
  const deactivatedChats = snapshot?.deactivatedChats ?? [];
  const allUsers = snapshot?.users ?? [];
  const blacklist = snapshot?.blacklist ?? [];
  const ipBlacklist = snapshot?.ipBlacklist ?? [];
  const ipAbuseFlags = snapshot?.ipAbuseFlags ?? [];
  const blacklistedIpSet = useMemo(
    () => new Set(ipBlacklist.map((entry) => entry.ip.trim().toLowerCase())),
    [ipBlacklist]
  );
  const pendingCount = useMemo(() => pendingUsers.length, [pendingUsers.length]);

  useEffect(() => {
    if (!snapshot) {
      setSelectedUserIds([]);
      return;
    }

    const validIds = new Set(snapshot.users.map((user) => user.id));
    setSelectedUserIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [snapshot]);

  const readServerError = async (response: Response, fallback: string): Promise<string> => {
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return fallback;
    }

    const payload = await response.json().catch(() => null);
    if (payload && typeof payload === 'object' && 'error' in payload) {
      return String(payload.error);
    }

    return fallback;
  };

  const applyDecision = async (sessionId: string, action: 'approve' | 'reject' | 'kick') => {
    if (!activeToken) {
      setError('Admin-Token fehlt.');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/decision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': activeToken
        },
        body: JSON.stringify({ sessionId, action })
      });

      if (!response.ok) {
        throw new Error(await readServerError(response, 'Aktion fehlgeschlagen.'));
      }

      const next = await fetchSnapshot(activeToken);
      setSnapshot(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Aktion fehlgeschlagen.');
    } finally {
      setIsUpdating(false);
    }
  };

  const reactivateChat = async (chatId: string) => {
    if (!activeToken) {
      setError('Admin-Token fehlt.');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': activeToken
        },
        body: JSON.stringify({ action: 'reactivate', chatId })
      });

      if (!response.ok) {
        throw new Error(await readServerError(response, 'Chat konnte nicht reaktiviert werden.'));
      }

      const next = await fetchSnapshot(activeToken);
      setSnapshot(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Chat konnte nicht reaktiviert werden.');
    } finally {
      setIsUpdating(false);
    }
  };

  const deleteAccounts = async (mode: 'selected' | 'all') => {
    if (!activeToken) {
      setError('Admin-Token fehlt.');
      return;
    }

    const selected = mode === 'selected' ? selectedUserIds : [];
    if (mode === 'selected' && selected.length === 0) {
      setError('Bitte mindestens einen Account auswählen.');
      return;
    }

    const confirmed =
      mode === 'all'
        ? window.confirm('Wirklich ALLE Accounts löschen? Diese Aktion ist nicht rückgängig.')
        : window.confirm(`Wirklich ${selected.length} ausgewählte Accounts löschen?`);

    if (!confirmed) {
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': activeToken
        },
        body: JSON.stringify({
          mode,
          userIds: selected
        })
      });

      if (!response.ok) {
        throw new Error(await readServerError(response, 'Accounts konnten nicht gelöscht werden.'));
      }

      if (mode === 'all') {
        setSelectedUserIds([]);
      } else {
        const toRemove = new Set(selected);
        setSelectedUserIds((prev) => prev.filter((id) => !toRemove.has(id)));
      }

      const next = await fetchSnapshot(activeToken);
      setSnapshot(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Accounts konnten nicht gelöscht werden.');
    } finally {
      setIsUpdating(false);
    }
  };

  const addBlacklistEntry = async () => {
    if (!activeToken) {
      setError('Admin-Token fehlt.');
      return;
    }

    const value = blacklistValue.trim();
    if (!value) {
      setError('Bitte einen Namen oder eine E-Mail eintragen.');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/blacklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': activeToken
        },
        body: JSON.stringify({
          kind: blacklistKind,
          value,
          note: blacklistNote.trim() || null
        })
      });

      if (!response.ok) {
        throw new Error(await readServerError(response, 'Blacklist-Eintrag konnte nicht gespeichert werden.'));
      }

      setBlacklistValue('');
      setBlacklistNote('');
      const next = await fetchSnapshot(activeToken);
      setSnapshot(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Blacklist-Eintrag konnte nicht gespeichert werden.');
    } finally {
      setIsUpdating(false);
    }
  };

  const removeBlacklistEntry = async (entry: AdminBlacklistEntry) => {
    if (!activeToken) {
      setError('Admin-Token fehlt.');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/blacklist', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': activeToken
        },
        body: JSON.stringify({ id: entry.id })
      });

      if (!response.ok) {
        throw new Error(await readServerError(response, 'Blacklist-Eintrag konnte nicht geloescht werden.'));
      }

      const next = await fetchSnapshot(activeToken);
      setSnapshot(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Blacklist-Eintrag konnte nicht geloescht werden.');
    } finally {
      setIsUpdating(false);
    }
  };

  const addIpBlacklistEntry = async () => {
    if (!activeToken) {
      setError('Admin-Token fehlt.');
      return;
    }

    const ip = ipValue.trim();
    if (!ip) {
      setError('Bitte eine IP-Adresse eintragen.');
      return;
    }
    if (!ipScope.forbidRegister && !ipScope.forbidLogin && !ipScope.forbidReset && !ipScope.forbidChat) {
      setError('Bitte mindestens eine Sperraktion auswählen.');
      return;
    }

    setIsUpdating(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/ip-blacklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': activeToken
        },
        body: JSON.stringify({
          ip,
          note: ipNote.trim() || null,
          scope: ipScope
        })
      });
      if (!response.ok) {
        throw new Error(await readServerError(response, 'IP-Blacklist-Eintrag konnte nicht gespeichert werden.'));
      }
      setIpValue('');
      setIpNote('');
      const next = await fetchSnapshot(activeToken);
      setSnapshot(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'IP-Blacklist-Eintrag konnte nicht gespeichert werden.');
    } finally {
      setIsUpdating(false);
    }
  };

  const removeIpBlacklistEntry = async (entry: AdminIpBlacklistEntry) => {
    if (!activeToken) {
      setError('Admin-Token fehlt.');
      return;
    }
    setIsUpdating(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/ip-blacklist', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': activeToken
        },
        body: JSON.stringify({ id: entry.id })
      });
      if (!response.ok) {
        throw new Error(await readServerError(response, 'IP-Blacklist-Eintrag konnte nicht gelöscht werden.'));
      }
      const next = await fetchSnapshot(activeToken);
      setSnapshot(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'IP-Blacklist-Eintrag konnte nicht gelöscht werden.');
    } finally {
      setIsUpdating(false);
    }
  };

  const adminSetPassword = async () => {
    if (!activeToken) {
      setError('Admin-Token fehlt.');
      return;
    }
    const userId = passwordTargetUserId.trim();
    if (!userId) {
      setError('Bitte einen Nutzer auswählen.');
      return;
    }
    const password = passwordValue;
    if (!password || password.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen haben.');
      return;
    }

    setIsUpdating(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': activeToken
        },
        body: JSON.stringify({
          userId,
          password,
          revokeSessions: revokePasswordSessions
        })
      });
      if (!response.ok) {
        throw new Error(await readServerError(response, 'Passwort konnte nicht gesetzt werden.'));
      }
      setPasswordValue('');
      const next = await fetchSnapshot(activeToken);
      setSnapshot(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Passwort konnte nicht gesetzt werden.');
    } finally {
      setIsUpdating(false);
    }
  };

  const promoteAbuseFlagToBlacklist = async (ip: string, reason?: string | null) => {
    if (!activeToken) {
      setError('Admin-Token fehlt.');
      return;
    }

    const normalizedIp = ip.trim();
    if (!normalizedIp) {
      setError('Ungültige IP-Adresse.');
      return;
    }

    setIsUpdating(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/ip-blacklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': activeToken
        },
        body: JSON.stringify({
          ip: normalizedIp,
          note: reason ? `Aus Abuse-Flag: ${reason}` : 'Aus Abuse-Flag übernommen',
          scope: {
            forbidRegister: true,
            forbidLogin: true,
            forbidReset: true,
            forbidChat: true,
            terminateSessions: true
          }
        })
      });
      if (!response.ok) {
        throw new Error(await readServerError(response, 'IP konnte nicht in die Blacklist übernommen werden.'));
      }

      const next = await fetchSnapshot(activeToken);
      setSnapshot(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'IP konnte nicht in die Blacklist übernommen werden.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <main className="space-y-4" aria-busy={isConnecting || isUpdating}>
      <section className="glass-panel rounded-2xl p-4">
        <h1 className="text-xl font-semibold">Admin-Panel</h1>
        <p className="surface-muted mt-1 text-sm">Mit Admin-Token verbinden, um Warteschlange und Entscheidungen live zu verwalten.</p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            aria-label="Admin-Token eingeben"
            value={adminTokenInput}
            onChange={(event) => setAdminTokenInput(event.target.value)}
            className="glass-input flex-1 text-sm"
            placeholder="Admin-Token"
          />
          <button
            type="button"
            className="btn-primary text-sm"
            onClick={() => {
              const token = adminTokenInput.trim();
              localStorage.setItem('chat_admin_token', token);
              setActiveToken(token);
              setSnapshot(null);
              setError(null);
            }}
          >
            Verbinden
          </button>
          <button
            type="button"
            className="btn-soft"
            onClick={() => {
              localStorage.removeItem('chat_admin_token');
              setAdminTokenInput('');
              setActiveToken('');
              setSnapshot(null);
              setError(null);
              setIsConnecting(false);
            }}
          >
            Trennen
          </button>
        </div>
        <p className="surface-muted mt-3 text-xs">
          Neues Token nötig? Zu{' '}
          <Link href="/admin/token" className="text-cyan-300 underline hover:text-cyan-200">
            /admin/token
          </Link>
          .
        </p>

        {!activeToken ? (
          <p className="alert-info mt-3 rounded-md px-3 py-2 text-sm">
            Nicht verbunden. Gib ein Admin-Token ein und klicke auf Verbinden.
          </p>
        ) : null}
        {isConnecting ? (
          <p className="alert-info mt-3 rounded-md px-3 py-2 text-sm">Verbinde und lade Live-Daten...</p>
        ) : null}
        {error ? <p role="alert" aria-live="assertive" className="alert-error mt-3 rounded-md px-3 py-2 text-sm">{error}</p> : null}
      </section>

      {snapshot ? <section className="glass-panel rounded-2xl p-4">
        <h2 className="surface-muted text-sm font-semibold uppercase tracking-wide">Blacklist</h2>
        <p className="surface-muted mt-1 text-sm">
          Namen und E-Mail-Adressen werden in der DB gespeichert und blockieren Registrierung, Login, Reset und Profil-Updates.
        </p>

        <div className="mt-3 grid gap-2 md:grid-cols-[140px_1fr]">
          <select
            value={blacklistKind}
            onChange={(event) => setBlacklistKind(event.target.value === 'email' ? 'email' : 'name')}
            className="glass-input text-sm"
          >
            <option value="name">Name</option>
            <option value="email">E-Mail</option>
          </select>
          <input
            value={blacklistValue}
            onChange={(event) => setBlacklistValue(event.target.value)}
            className="glass-input text-sm"
            placeholder={blacklistKind === 'email' ? 'z.B. test@example.com' : 'z.B. spammer oder Max Mustermann'}
          />
        </div>

        <textarea
          value={blacklistNote}
          onChange={(event) => setBlacklistNote(event.target.value)}
          className="glass-input mt-2 min-h-[84px] text-sm"
          placeholder="Optionale Admin-Notiz"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => {
              void addBlacklistEntry();
            }}
            className="btn-soft btn-danger disabled:cursor-not-allowed disabled:opacity-60"
          >
            Eintrag speichern
          </button>
        </div>

        <ul className="mt-4 space-y-2">
          {blacklist.map((entry) => (
            <li key={entry.id} className="glass-card rounded-lg p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{entry.value}</p>
                  <p className="text-xs uppercase tracking-wide text-slate-400">{entry.kind === 'email' ? 'E-Mail' : 'Name'}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Aktualisiert: {new Date(entry.updatedAt).toLocaleString()}
                  </p>
                  {entry.note ? <p className="mt-2 text-sm text-slate-200">{entry.note}</p> : null}
                </div>
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => {
                    void removeBlacklistEntry(entry);
                  }}
                  className="btn-soft btn-danger px-2 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Entfernen
                </button>
              </div>
            </li>
          ))}
          {blacklist.length === 0 ? <li className="surface-muted text-sm">Keine Blacklist-Einträge vorhanden.</li> : null}
        </ul>
      </section> : null}

      {snapshot ? <section className="glass-panel rounded-2xl p-4">
        <h2 className="surface-muted text-sm font-semibold uppercase tracking-wide">IP-Blacklist</h2>
        <p className="surface-muted mt-1 text-sm">
          Für jede IP-Adresse kannst du festlegen, welche Aktionen gesperrt werden und ob aktive Sessions sofort beendet werden.
        </p>

        <input
          value={ipValue}
          onChange={(event) => setIpValue(event.target.value)}
          className="glass-input mt-3 text-sm"
          placeholder="z.B. 203.0.113.5"
        />

        <textarea
          value={ipNote}
          onChange={(event) => setIpNote(event.target.value)}
          className="glass-input mt-2 min-h-[84px] text-sm"
          placeholder="Optionale Admin-Notiz"
        />

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {[
            ['forbidRegister', 'Registrierung sperren'],
            ['forbidLogin', 'Login sperren'],
            ['forbidReset', 'Reset/Passwort vergessen sperren'],
            ['forbidChat', 'Chat/Message senden sperren'],
            ['terminateSessions', 'Aktive Sessions sofort beenden']
          ].map(([key, label]) => (
            <label key={key} className="glass-card flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(ipScope[key as keyof typeof ipScope])}
                onChange={(event) =>
                  setIpScope((prev) => ({
                    ...prev,
                    [key]: event.target.checked
                  }))
                }
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => {
              void addIpBlacklistEntry();
            }}
            className="btn-soft btn-danger disabled:cursor-not-allowed disabled:opacity-60"
          >
            IP speichern
          </button>
        </div>

        <ul className="mt-4 space-y-2">
          {ipBlacklist.map((entry) => (
            <li key={entry.id} className="glass-card rounded-lg p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{entry.ip}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Aktionen:{' '}
                    {[
                      entry.scope.forbidRegister ? 'Register' : null,
                      entry.scope.forbidLogin ? 'Login' : null,
                      entry.scope.forbidReset ? 'Reset' : null,
                      entry.scope.forbidChat ? 'Chat' : null
                    ].filter(Boolean).join(', ') || 'Keine'}
                    {entry.scope.terminateSessions ? ' | Sessions beenden' : ''}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Aktualisiert: {new Date(entry.updatedAt).toLocaleString()}
                  </p>
                  {entry.note ? <p className="mt-2 text-sm text-slate-200">{entry.note}</p> : null}
                </div>
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => {
                    void removeIpBlacklistEntry(entry);
                  }}
                  className="btn-soft btn-danger px-2 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Entfernen
                </button>
              </div>
            </li>
          ))}
          {ipBlacklist.length === 0 ? <li className="surface-muted text-sm">Keine IP-Sperren vorhanden.</li> : null}
        </ul>
      </section> : null}

      {snapshot ? <section className="glass-panel rounded-2xl p-4">
        <h2 className="surface-muted text-sm font-semibold uppercase tracking-wide">IP Abuse Flags</h2>
        <p className="surface-muted mt-1 text-sm">
          Zeigt auffällige IP-Adressen mit Strike-Zähler, letztem Grund und möglicher Auto-Sperre.
        </p>
        <ul className="mt-4 space-y-2">
          {ipAbuseFlags.map((flag) => (
            <li key={flag.ip} className="glass-card rounded-lg p-3">
              {(() => {
                const isAlreadyBlacklisted = blacklistedIpSet.has(flag.ip.trim().toLowerCase());
                return (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{flag.ip}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Status: {isAlreadyBlacklisted ? 'Bereits in IP-Blacklist' : 'Noch nicht in IP-Blacklist'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Strikes: {flag.strikes}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Blockiert bis: {flag.blockedUntil ? new Date(flag.blockedUntil).toLocaleString() : 'nicht blockiert'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Zuletzt: {new Date(flag.updatedAt).toLocaleString()}</p>
                  {flag.lastReason ? <p className="mt-2 text-sm text-slate-200">{flag.lastReason}</p> : null}
                </div>
                <button
                  type="button"
                  disabled={isUpdating || isAlreadyBlacklisted}
                  onClick={() => {
                    void promoteAbuseFlagToBlacklist(flag.ip, flag.lastReason);
                  }}
                  className="btn-soft btn-danger px-2 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isAlreadyBlacklisted ? 'Bereits übernommen' : 'In IP-Blacklist übernehmen'}
                </button>
              </div>
                );
              })()}
            </li>
          ))}
          {ipAbuseFlags.length === 0 ? <li className="surface-muted text-sm">Keine auffälligen IPs vorhanden.</li> : null}
        </ul>
      </section> : null}

      {snapshot ? <section className="glass-panel rounded-2xl p-4">
        <h2 className="surface-muted text-sm font-semibold uppercase tracking-wide">Admin Passwort-Reset</h2>
        <p className="surface-muted mt-1 text-sm">
          Setzt ein neues Passwort für einen Nutzer. Optional werden alle aktiven Sessions dieses Nutzers sofort beendet.
        </p>

        <select
          value={passwordTargetUserId}
          onChange={(event) => setPasswordTargetUserId(event.target.value)}
          className="glass-input mt-3 text-sm"
        >
          <option value="">Nutzer auswählen...</option>
          {allUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} [{user.status}]
            </option>
          ))}
        </select>

        <input
          type="password"
          value={passwordValue}
          onChange={(event) => setPasswordValue(event.target.value)}
          className="glass-input mt-2 text-sm"
          placeholder="Neues Passwort (mind. 8 Zeichen)"
        />

        <label className="mt-2 flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={revokePasswordSessions}
            onChange={(event) => setRevokePasswordSessions(event.target.checked)}
          />
          Aktive Sessions des Nutzers beenden
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isUpdating || !passwordTargetUserId}
            onClick={() => {
              void adminSetPassword();
            }}
            className="btn-soft btn-warning disabled:cursor-not-allowed disabled:opacity-60"
          >
            Passwort setzen
          </button>
        </div>
      </section> : null}

      {snapshot ? <section className="glass-panel rounded-2xl p-4">
        <h2 className="surface-muted text-sm font-semibold uppercase tracking-wide">Accounts löschen</h2>
        <p className="surface-muted mt-1 text-sm">
          Wähle einen, mehrere oder alle Accounts aus und lösche sie direkt.
        </p>

        <select
          multiple
          value={selectedUserIds}
          onChange={(event) => {
            const values = Array.from(event.target.selectedOptions).map((option) => option.value);
            setSelectedUserIds(values);
          }}
          className="glass-input mt-3 h-48 text-sm"
        >
          {allUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} [{user.status}]
            </option>
          ))}
        </select>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isUpdating || allUsers.length === 0}
            onClick={() => setSelectedUserIds(allUsers.map((user) => user.id))}
            className="btn-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            Alle auswählen
          </button>
          <button
            type="button"
            disabled={isUpdating || selectedUserIds.length === 0}
            onClick={() => setSelectedUserIds([])}
            className="btn-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            Auswahl leeren
          </button>
          <button
            type="button"
            disabled={isUpdating || selectedUserIds.length === 0}
            onClick={() => {
              void deleteAccounts('selected');
            }}
            className="btn-soft btn-danger disabled:cursor-not-allowed disabled:opacity-60"
          >
            Ausgewählte löschen ({selectedUserIds.length})
          </button>
          <button
            type="button"
            disabled={isUpdating || allUsers.length === 0}
            onClick={() => {
              void deleteAccounts('all');
            }}
            className="btn-soft btn-danger-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            Alle Accounts löschen ({allUsers.length})
          </button>
        </div>
      </section> : null}

      {snapshot ? <section className="grid gap-4 md:grid-cols-2">
        <div className="glass-panel rounded-2xl p-4">
          <h2 className="surface-muted text-sm font-semibold uppercase tracking-wide">Wartend ({pendingCount})</h2>
          <ul className="mt-3 space-y-2">
            {pendingUsers.map((user) => (
              <li key={user.id} className="glass-card rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{user.name}</p>
                    <p className="text-xs text-slate-400">{new Date(user.createdAt).toLocaleTimeString()}</p>
                  </div>
                  <StatusPill status={user.status} />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => applyDecision(user.id, 'approve')}
                    className="btn-soft btn-success flex-1 px-2 py-1.5 text-xs disabled:opacity-60"
                  >
                    Freigeben
                  </button>
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => applyDecision(user.id, 'reject')}
                    className="btn-soft btn-danger flex-1 px-2 py-1.5 text-xs disabled:opacity-60"
                  >
                    Ablehnen
                  </button>
                </div>
              </li>
            ))}
            {pendingUsers.length === 0 ? <li className="surface-muted text-sm">Keine wartenden Nutzer.</li> : null}
          </ul>
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <h2 className="surface-muted text-sm font-semibold uppercase tracking-wide">Freigegeben ({approvedUsers.length})</h2>
          <ul className="mt-3 space-y-2">
            {approvedUsers.map((user) => (
              <li key={user.id} className="glass-card rounded-lg p-3 text-sm text-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <span>{user.name}</span>
                  <StatusPill status={user.status} />
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => applyDecision(user.id, 'kick')}
                    className="btn-soft btn-warning w-full px-2 py-1.5 text-xs disabled:opacity-60"
                  >
                    Aus Chat entfernen
                  </button>
                </div>
              </li>
            ))}
            {approvedUsers.length === 0 ? <li className="surface-muted text-sm">Noch keine freigegebenen Nutzer.</li> : null}
          </ul>

          <h2 className="surface-muted mt-5 text-sm font-semibold uppercase tracking-wide">Abgelehnt ({rejectedUsers.length})</h2>
          <ul className="mt-3 space-y-2">
            {rejectedUsers.map((user) => (
              <li key={user.id} className="glass-card rounded-lg p-3 text-sm text-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <span>{user.name}</span>
                  <StatusPill status={user.status} />
                </div>
              </li>
            ))}
            {rejectedUsers.length === 0 ? <li className="surface-muted text-sm">Keine abgelehnten Nutzer.</li> : null}
          </ul>
        </div>
      </section> : null}

      {snapshot ? <section className="glass-panel rounded-2xl p-4">
        <h2 className="surface-muted text-sm font-semibold uppercase tracking-wide">Chats</h2>
        <ul className="mt-3 space-y-2">
          {activeChats.map((chat) => (
            <li key={chat.id} className="glass-card rounded-lg p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{chat.name}</p>
                  <p className="text-xs text-slate-400">
                    {chat.isGlobal ? 'Global-Chat' : 'Aktiv'} - Mitglieder: {chat.membersCount}
                  </p>
                </div>
              </div>
            </li>
          ))}
          {activeChats.length === 0 ? <li className="surface-muted text-sm">Keine aktiven Chats.</li> : null}
        </ul>

        <h3 className="surface-muted mt-5 text-sm font-semibold uppercase tracking-wide">Deaktiviert</h3>
        <ul className="mt-3 space-y-2">
          {deactivatedChats.map((chat) => (
            <li key={chat.id} className="glass-card rounded-lg p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{chat.name}</p>
                  <p className="text-xs text-slate-400">
                    Deaktiviert: {chat.deactivatedAt ? new Date(chat.deactivatedAt).toLocaleString() : 'k. A.'}
                    {chat.deactivatedByName ? ` von ${chat.deactivatedByName}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => reactivateChat(chat.id)}
                  className="btn-soft btn-success px-2 py-1.5 text-xs disabled:opacity-60"
                >
                  Reaktivieren
                </button>
              </div>
            </li>
          ))}
          {deactivatedChats.length === 0 ? <li className="surface-muted text-sm">Keine deaktivierten Chats.</li> : null}
        </ul>
      </section> : null}

      {snapshot ? <section className="glass-panel rounded-2xl p-4">
        <h2 className="surface-muted text-sm font-semibold uppercase tracking-wide">Letzte Nachrichten</h2>
        <ul className="mt-3 space-y-2">
          {recentMessages.map((message) => (
            <li key={message.id} className="glass-card rounded-lg p-3">
              <p className="text-xs text-slate-400">
                {new Date(message.createdAt).toLocaleTimeString()} - [{message.chatName}] {message.userName}
              </p>
              <p className="mt-1 text-sm text-slate-100">{message.text}</p>
            </li>
          ))}
          {recentMessages.length === 0 ? <li className="surface-muted text-sm">Noch keine Nachrichten.</li> : null}
        </ul>
      </section> : null}
    </main>
  );
}
