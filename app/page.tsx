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
      <section className="glass-panel rounded-2xl p-6">
        <h1 className="text-2xl font-semibold text-slate-100">Echtzeit-Chat Demo</h1>
        <p className="surface-muted mt-2 text-sm">
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
              className="glass-input"
              placeholder="z. B. Lena"
            />
          </label>

          {error ? <p className="alert-error rounded-md px-3 py-2 text-sm">{error}</p> : null}

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
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
              className="btn-soft w-full font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              Mit gespeichertem Namen anfragen ({savedName})
            </button>
          ) : null}
        </form>
      </section>
    </main>
  );
}
