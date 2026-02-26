'use client';

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ChatMessage, UserStatus } from '@/types/chat';

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const statusLabels: Record<UserStatus, string> = {
  pending: 'wartend',
  approved: 'online',
  rejected: 'abgelehnt'
};

function ChatPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [sessionStatus, setSessionStatus] = useState<UserStatus>('approved');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const hasRedirectedRef = useRef(false);

  const sessionId = useMemo(() => params.get('sessionId') ?? '', [params]);

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

    const stream = new EventSource(`/api/chat/stream?sessionId=${encodeURIComponent(sessionId)}`);

    stream.addEventListener('history', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { messages: ChatMessage[] };
      setMessages(payload.messages);
      setConnectionState('live');
    });

    stream.addEventListener('message', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { message: ChatMessage };
      setMessages((prev) => [...prev, payload.message]);
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
      setError('Echtzeit-Verbindung getrennt. Bitte Seite neu laden.');
    };

    return () => {
      stream.close();
    };
  }, [router, sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim() || !sessionId) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, text })
      });
      if (!response.ok) {
        throw new Error('Nachricht konnte nicht gesendet werden.');
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
    if (!file || !sessionId) {
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set('sessionId', sessionId);
      formData.set('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload fehlgeschlagen.');
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Upload fehlgeschlagen.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  return (
    <main className="grid gap-4 md:grid-cols-[1fr_240px]">
      <section className="flex min-h-[65vh] flex-col rounded-2xl border border-slate-700/80 bg-panel/70 p-4">
        <div className="mb-3 flex items-center justify-between border-b border-slate-700/70 pb-2">
          <h1 className="text-xl font-semibold">Chatraum</h1>
          <span className="text-xs uppercase tracking-wide text-slate-300">
            {connectionState === 'live' ? statusLabels[sessionStatus] : connectionState === 'connecting' ? 'Verbinden...' : 'Getrennt'}
          </span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {messages.map((message) => (
            <article key={message.id} className="rounded-lg border border-slate-700/70 bg-slate-900/65 px-3 py-2">
              <header className="mb-1 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-accent">{message.userName}</span>
                <time className="text-xs text-slate-400">{formatTime(message.createdAt)}</time>
              </header>
              <p className="text-sm text-slate-100 break-words">{message.text}</p>
              {message.attachments?.length ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {message.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <a
                        className="text-cyan-300 underline hover:text-cyan-200"
                        href={`/api/upload/${attachment.id}?sessionId=${encodeURIComponent(sessionId)}`}
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
            className="flex-1 rounded-md border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm outline-none ring-accent/70 focus:ring-2"
          />
          <button
            type="submit"
            disabled={isSending || !text.trim()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Senden
          </button>
        </form>

        {error ? <p className="mt-3 rounded-md bg-rose-900/30 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
      </section>

      <aside className="space-y-3 rounded-2xl border border-slate-700/80 bg-panel/70 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Aktionen</h2>

        <label className="block space-y-2 text-sm">
          <span className="text-slate-300">Datei hochladen (max. 2 MB)</span>
          <input
            type="file"
            onChange={uploadFile}
            disabled={isUploading}
            className="w-full rounded-md border border-slate-600 bg-slate-900/80 p-2 text-xs file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-slate-100"
          />
        </label>

        <button
          type="button"
          onClick={() => {
            localStorage.removeItem('chat_session_id');
            router.push('/');
          }}
          className="w-full rounded-md border border-slate-500 px-3 py-2 text-sm hover:bg-slate-800"
        >
          Chat verlassen
        </button>
      </aside>
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-xl">
          <section className="rounded-2xl border border-slate-700/80 bg-panel/70 p-6 shadow-xl">
            <p className="text-sm text-slate-300">Chat wird geladen...</p>
          </section>
        </main>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}
