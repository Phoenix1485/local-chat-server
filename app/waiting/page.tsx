'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { UserStatus } from '@/types/chat';
import { StatusPill } from '@/components/StatusPill';

function WaitingPageContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<UserStatus>('pending');
  const [error, setError] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState('');
  const hasRedirectedRef = useRef(false);

  const sessionId = useMemo(() => {
    return params.get('sessionId') ?? '';
  }, [params]);

  useEffect(() => {
    hasRedirectedRef.current = false;

    let activeSession = sessionId;
    if (!activeSession) {
      const stored = localStorage.getItem('chat_session_id');
      if (!stored) {
        router.replace('/');
        return;
      }
      activeSession = stored;
      router.replace(`/waiting?sessionId=${encodeURIComponent(stored)}`);
      return;
    }

    setActiveSessionId(activeSession);
    localStorage.setItem('chat_session_id', activeSession);

    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stream: EventSource | null = null;

    const applyStatus = (nextStatus: UserStatus) => {
      setStatus(nextStatus);
    };

    const fetchStatus = async () => {
      const response = await fetch(`/api/waiting/status?sessionId=${encodeURIComponent(activeSession)}`, {
        cache: 'no-store'
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json().catch(() => null)) as { status?: UserStatus } | null;
      if (!payload || !payload.status) {
        return;
      }

      applyStatus(payload.status);
      setError(null);
    };

    const openStream = () => {
      if (closed) {
        return;
      }

      stream?.close();
      stream = new EventSource(`/api/waiting/stream?sessionId=${encodeURIComponent(activeSession)}`);

      stream.addEventListener('status', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { status: UserStatus };
          applyStatus(payload.status);
          setError(null);
        } catch {
          setError('Status-Antwort ungueltig.');
        }
      });

      stream.onerror = () => {
        if (closed) {
          return;
        }
        setError('Live-Verbindung unterbrochen. Verbindung wird neu aufgebaut...');
        stream?.close();
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            openStream();
          }, 1500);
        }
      };
    };

    void fetchStatus();
    openStream();
    const pollTimer = setInterval(() => {
      void fetchStatus();
    }, 2500);

    return () => {
      closed = true;
      stream?.close();
      clearInterval(pollTimer);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [router, sessionId]);

  useEffect(() => {
    if (status !== 'approved' || !activeSessionId || hasRedirectedRef.current) {
      return;
    }

    hasRedirectedRef.current = true;
    const target = `/chat?sessionId=${encodeURIComponent(activeSessionId)}`;
    router.replace(target);

    const hardRedirectTimer = window.setTimeout(() => {
      if (window.location.pathname !== '/chat') {
        window.location.assign(target);
      }
    }, 700);

    return () => {
      window.clearTimeout(hardRedirectTimer);
    };
  }, [activeSessionId, router, status]);

  return (
    <main className="mx-auto max-w-xl">
      <section className="rounded-2xl border border-slate-700/80 bg-panel/70 p-6 shadow-xl">
        <h1 className="text-2xl font-semibold">Warteraum</h1>
        <p className="mt-2 text-sm text-slate-300">Deine Anfrage ist in der Admin-Warteschlange. Diese Seite aktualisiert sich automatisch.</p>

        <div className="mt-6 rounded-xl border border-slate-700/70 bg-slate-900/70 p-4">
          <p className="text-sm text-slate-300">Aktueller Status</p>
          <div className="mt-2">
            <StatusPill status={status} />
          </div>

          {status === 'pending' ? <p className="mt-3 text-sm text-slate-300">Bitte halte diesen Tab geoeffnet.</p> : null}
          {status === 'approved' ? <p className="mt-3 text-sm text-emerald-300">Freigegeben. Weiterleitung zum Chat...</p> : null}
          {status === 'rejected' ? <p className="mt-3 text-sm text-rose-300">Deine Anfrage wurde vom Admin abgelehnt.</p> : null}
          {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
        </div>

        <button
          type="button"
          onClick={() => router.push('/')}
          className="mt-6 rounded-md border border-slate-500 px-4 py-2 text-sm hover:bg-slate-800"
        >
          Zurueck zur Anfrage
        </button>
      </section>
    </main>
  );
}

export default function WaitingPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-xl">
          <section className="rounded-2xl border border-slate-700/80 bg-panel/70 p-6 shadow-xl">
            <p className="text-sm text-slate-300">Warteraum wird geladen...</p>
          </section>
        </main>
      }
    >
      <WaitingPageContent />
    </Suspense>
  );
}
