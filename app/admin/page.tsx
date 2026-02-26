'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminSnapshot } from '@/types/chat';
import { StatusPill } from '@/components/StatusPill';

export default function AdminPage() {
  const [adminTokenInput, setAdminTokenInput] = useState('');
  const [activeToken, setActiveToken] = useState('');
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

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
          serverError ?? 'Unauthorized. Token ist ungueltig/abgelaufen oder Vercel ADMIN_KEY passt nicht.'
        );
      }
      throw new Error(serverError ?? `Admin-Status konnte nicht geladen werden (${response.status}).`);
    }

    if (!payload || typeof payload !== 'object') {
      throw new Error('Admin-Statusantwort ungueltig.');
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
      setError('Bitte mindestens einen Account auswaehlen.');
      return;
    }

    const confirmed =
      mode === 'all'
        ? window.confirm('Wirklich ALLE Accounts loeschen? Diese Aktion ist nicht rueckgaengig.')
        : window.confirm(`Wirklich ${selected.length} ausgewaehlte Accounts loeschen?`);

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
        throw new Error(await readServerError(response, 'Accounts konnten nicht geloescht werden.'));
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
      setError(requestError instanceof Error ? requestError.message : 'Accounts konnten nicht geloescht werden.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <main className="space-y-4">
      <section className="glass-panel rounded-2xl p-4">
        <h1 className="text-xl font-semibold">Admin-Panel</h1>
        <p className="surface-muted mt-1 text-sm">Mit Admin-Token verbinden, um Warteschlange und Entscheidungen live zu verwalten.</p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
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
          Neues Token noetig? Zu{' '}
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
        {error ? <p className="alert-error mt-3 rounded-md px-3 py-2 text-sm">{error}</p> : null}
      </section>

      {snapshot ? <section className="glass-panel rounded-2xl p-4">
        <h2 className="surface-muted text-sm font-semibold uppercase tracking-wide">Accounts loeschen</h2>
        <p className="surface-muted mt-1 text-sm">
          Waehle einen, mehrere oder alle Accounts aus und loesche sie direkt.
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
            Alle auswaehlen
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
            className="rounded-md bg-rose-500/80 px-3 py-2 text-sm font-semibold text-rose-50 hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Ausgewaehlte loeschen ({selectedUserIds.length})
          </button>
          <button
            type="button"
            disabled={isUpdating || allUsers.length === 0}
            onClick={() => {
              void deleteAccounts('all');
            }}
            className="rounded-md border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Alle Accounts loeschen ({allUsers.length})
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
                    className="flex-1 rounded-md bg-emerald-500/80 px-2 py-1.5 text-xs font-semibold text-emerald-50 hover:bg-emerald-400 disabled:opacity-60"
                  >
                    Freigeben
                  </button>
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => applyDecision(user.id, 'reject')}
                    className="flex-1 rounded-md bg-rose-500/80 px-2 py-1.5 text-xs font-semibold text-rose-50 hover:bg-rose-400 disabled:opacity-60"
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
                    className="w-full rounded-md bg-amber-500/80 px-2 py-1.5 text-xs font-semibold text-amber-50 hover:bg-amber-400 disabled:opacity-60"
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
                    {chat.isGlobal ? 'Global' : 'Aktiv'} - Mitglieder: {chat.membersCount}
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
                    Deactivated: {chat.deactivatedAt ? new Date(chat.deactivatedAt).toLocaleString() : 'n/a'}
                    {chat.deactivatedByName ? ` von ${chat.deactivatedByName}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => reactivateChat(chat.id)}
                  className="rounded-md bg-emerald-500/80 px-2 py-1.5 text-xs font-semibold text-emerald-50 hover:bg-emerald-400 disabled:opacity-60"
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
