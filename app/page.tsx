'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinPage() {
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const storedName = localStorage.getItem('chat_display_name') ?? '';
    if (storedName) {
      setName(storedName);
      setSavedName(storedName);
    }
  }, []);

  const requestAccess = async (rawName: string) => {
    setError(null);
    setIsLoading(true);

    try {
      const normalizedName = rawName.trim();
      const response = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: normalizedName })
      });

      const contentType = response.headers.get('content-type') ?? '';
      const payload =
        contentType.includes('application/json')
          ? await response.json().catch(() => null)
          : null;

      if (!response.ok) {
        const serverError =
          payload && typeof payload === 'object' && 'error' in payload ? String(payload.error) : null;
        throw new Error(serverError ?? 'Beitrittsanfrage fehlgeschlagen.');
      }

      if (!payload || typeof payload !== 'object' || !('sessionId' in payload)) {
        throw new Error('Serverantwort unvollständig.');
      }

      const sessionId = String(payload.sessionId);
      localStorage.setItem('chat_session_id', sessionId);
      localStorage.setItem('chat_display_name', normalizedName);
      setSavedName(normalizedName);
      router.push(`/waiting?sessionId=${encodeURIComponent(sessionId)}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Beitrittsanfrage fehlgeschlagen.');
    } finally {
      setIsLoading(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await requestAccess(name);
  };

  return (
    <main className="mx-auto max-w-xl">
      <section className="rounded-2xl border border-slate-700/80 bg-panel/70 p-6 shadow-xl backdrop-blur">
        <h1 className="text-2xl font-semibold text-slate-100">Echtzeit-Chat Demo</h1>
        <p className="mt-2 text-sm text-slate-300">
          Gib deinen Namen ein, um der Freigabe-Warteschlange beizutreten. Ein Admin muss deinen Zugriff freigeben, bevor der Chat nutzbar ist.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-slate-200">Anzeigename</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={24}
              required
              className="w-full rounded-md border border-slate-600 bg-slate-900/80 px-3 py-2 text-slate-100 outline-none ring-accent/60 transition focus:ring-2"
              placeholder="z. B. Lena"
            />
          </label>

          {error ? <p className="rounded-md bg-rose-900/30 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-md bg-accent px-4 py-2 font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Wird gesendet...' : 'Freigabe anfragen'}
          </button>

          {savedName ? (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                setName(savedName);
                void requestAccess(savedName);
              }}
              className="w-full rounded-md border border-slate-500 px-4 py-2 font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Mit gespeichertem Namen anfragen ({savedName})
            </button>
          ) : null}
        </form>
      </section>
    </main>
  );
}
