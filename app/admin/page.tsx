'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminSnapshot } from '@/types/chat';
import { StatusPill } from '@/components/StatusPill';

const EMPTY_SNAPSHOT: AdminSnapshot = {
  pending: [],
  approved: [],
  rejected: [],
  recentMessages: []
};

export default function AdminPage() {
  const [adminTokenInput, setAdminTokenInput] = useState('');
  const [activeToken, setActiveToken] = useState('');
  const [snapshot, setSnapshot] = useState<AdminSnapshot>(EMPTY_SNAPSHOT);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchSnapshot = useCallback(async (token: string) => {
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
      throw new Error(serverError ?? 'Admin-Status konnte nicht geladen werden.');
    }

    if (!payload || typeof payload !== 'object') {
      throw new Error('Admin-Statusantwort ungueltig.');
    }

    setSnapshot(payload as AdminSnapshot);
    setError(null);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('chat_admin_token') ?? '';
    setAdminTokenInput(stored);
    setActiveToken(stored);
  }, []);

  useEffect(() => {
    if (!activeToken) {
      return;
    }

    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stream: EventSource | null = null;

    const openStream = () => {
      if (closed) {
        return;
      }

      stream?.close();
      stream = new EventSource(`/api/admin/stream?adminToken=${encodeURIComponent(activeToken)}`);

      stream.addEventListener('snapshot', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as AdminSnapshot;
          setSnapshot(payload);
          setError(null);
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

    void fetchSnapshot(activeToken).catch((requestError) => {
      setError(requestError instanceof Error ? requestError.message : 'Admin-Status konnte nicht geladen werden.');
    });

    openStream();
    const pollTimer = setInterval(() => {
      void fetchSnapshot(activeToken).catch(() => {
        // Stream reconnect handler already surfaces the error state.
      });
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

  const pendingCount = useMemo(() => snapshot.pending.length, [snapshot.pending.length]);

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
        const contentType = response.headers.get('content-type') ?? '';
        const payload =
          contentType.includes('application/json')
            ? await response.json().catch(() => null)
            : null;
        const serverError =
          payload && typeof payload === 'object' && 'error' in payload ? String(payload.error) : null;
        throw new Error(serverError ?? 'Aktion fehlgeschlagen.');
      }

      await fetchSnapshot(activeToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Aktion fehlgeschlagen.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <main className="space-y-4">
      <section className="rounded-2xl border border-slate-700/80 bg-panel/70 p-4">
        <h1 className="text-xl font-semibold">Admin-Panel</h1>
        <p className="mt-1 text-sm text-slate-300">Mit Admin-Token verbinden, um Warteschlange und Entscheidungen live zu verwalten.</p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={adminTokenInput}
            onChange={(event) => setAdminTokenInput(event.target.value)}
            className="flex-1 rounded-md border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm outline-none ring-accent/70 focus:ring-2"
            placeholder="Admin-Token"
          />
          <button
            type="button"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-300"
            onClick={() => {
              const token = adminTokenInput.trim();
              localStorage.setItem('chat_admin_token', token);
              setActiveToken(token);
            }}
          >
            Verbinden
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-500 px-4 py-2 text-sm hover:bg-slate-800"
            onClick={() => {
              localStorage.removeItem('chat_admin_token');
              setAdminTokenInput('');
              setActiveToken('');
              setSnapshot(EMPTY_SNAPSHOT);
              setError(null);
            }}
          >
            Trennen
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Neues Token noetig? Zu{' '}
          <Link href="/admin/token" className="text-cyan-300 underline hover:text-cyan-200">
            /admin/token
          </Link>
          .
        </p>

        {error ? <p className="mt-3 rounded-md bg-rose-900/30 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-700/80 bg-panel/70 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Wartend ({pendingCount})</h2>
          <ul className="mt-3 space-y-2">
            {snapshot.pending.map((user) => (
              <li key={user.id} className="rounded-lg border border-slate-700/70 bg-slate-900/65 p-3">
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
            {snapshot.pending.length === 0 ? <li className="text-sm text-slate-400">Keine wartenden Nutzer.</li> : null}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-700/80 bg-panel/70 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Freigegeben ({snapshot.approved.length})</h2>
          <ul className="mt-3 space-y-2">
            {snapshot.approved.map((user) => (
              <li key={user.id} className="rounded-lg border border-slate-700/70 bg-slate-900/65 p-3 text-sm text-slate-100">
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
            {snapshot.approved.length === 0 ? <li className="text-sm text-slate-400">Noch keine freigegebenen Nutzer.</li> : null}
          </ul>

          <h2 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-300">Abgelehnt ({snapshot.rejected.length})</h2>
          <ul className="mt-3 space-y-2">
            {snapshot.rejected.map((user) => (
              <li key={user.id} className="rounded-lg border border-slate-700/70 bg-slate-900/65 p-3 text-sm text-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <span>{user.name}</span>
                  <StatusPill status={user.status} />
                </div>
              </li>
            ))}
            {snapshot.rejected.length === 0 ? <li className="text-sm text-slate-400">Keine abgelehnten Nutzer.</li> : null}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700/80 bg-panel/70 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Letzte Nachrichten</h2>
        <ul className="mt-3 space-y-2">
          {snapshot.recentMessages.map((message) => (
            <li key={message.id} className="rounded-lg border border-slate-700/70 bg-slate-900/65 p-3">
              <p className="text-xs text-slate-400">{new Date(message.createdAt).toLocaleTimeString()} - {message.userName}</p>
              <p className="mt-1 text-sm text-slate-100">{message.text}</p>
            </li>
          ))}
          {snapshot.recentMessages.length === 0 ? <li className="text-sm text-slate-400">Noch keine Nachrichten.</li> : null}
        </ul>
      </section>
    </main>
  );
}
