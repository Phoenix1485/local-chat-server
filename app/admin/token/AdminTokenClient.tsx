'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type TokenResponse = {
  token: string;
  issuedAt: number;
  expiresAt: number;
  expiresInMs: number;
};

export default function AdminTokenClient() {
  const [adminKey, setAdminKey] = useState('');
  const [currentToken, setCurrentToken] = useState('');
  const [latestToken, setLatestToken] = useState('');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const storedKey = localStorage.getItem('chat_admin_key') ?? '';
    const storedToken = localStorage.getItem('chat_admin_token') ?? '';
    setAdminKey(storedKey);
    setCurrentToken(storedToken);
    setLatestToken(storedToken);
  }, []);

  const requestNewToken = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminKey: adminKey.trim() || undefined,
          currentToken: currentToken.trim() || undefined
        })
      });

      const payload = (await response.json()) as Partial<TokenResponse> & { error?: string };
      if (!response.ok || !payload.token || !payload.expiresAt) {
        throw new Error('Token-Anfrage fehlgeschlagen.');
      }

      localStorage.setItem('chat_admin_key', adminKey.trim());
      localStorage.setItem('chat_admin_token', payload.token);

      setLatestToken(payload.token);
      setCurrentToken(payload.token);
      setExpiresAt(payload.expiresAt);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Token-Anfrage fehlgeschlagen.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl space-y-4">
      <section className="rounded-2xl border border-slate-700/80 bg-panel/70 p-5">
        <h1 className="text-xl font-semibold">Admin-Token</h1>
        <p className="mt-2 text-sm text-slate-300">
          Admin-Token erzeugen oder erneuern und danach im Admin-Panel verwenden.
        </p>

        <div className="mt-5 space-y-3">
          <label className="block space-y-1">
            <span className="text-sm text-slate-300">Admin-Key (fuer das erste Token)</span>
            <input
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              className="w-full rounded-md border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm outline-none ring-accent/70 focus:ring-2"
              placeholder="ADMIN_KEY"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-slate-300">Aktuelles Token (optional zur Erneuerung)</span>
            <textarea
              value={currentToken}
              onChange={(event) => setCurrentToken(event.target.value)}
              rows={4}
              className="w-full rounded-md border border-slate-600 bg-slate-900/80 px-3 py-2 text-xs outline-none ring-accent/70 focus:ring-2"
              placeholder="Vorhandenes Token einfuegen"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={requestNewToken}
            disabled={isLoading}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Wird erneuert...' : 'Token erneuern'}
          </button>
          <Link href="/admin" className="rounded-md border border-slate-500 px-4 py-2 text-sm hover:bg-slate-800">
            Zum Admin-Panel
          </Link>
        </div>

        {expiresAt ? (
          <p className="mt-3 text-xs text-emerald-300">Token gueltig bis: {new Date(expiresAt).toLocaleString()}</p>
        ) : null}
        {error ? <p className="mt-3 rounded-md bg-rose-900/30 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
      </section>

      <section className="rounded-2xl border border-slate-700/80 bg-panel/70 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Aktuelles Token</h2>
        <textarea
          readOnly
          value={latestToken}
          rows={5}
          className="mt-3 w-full rounded-md border border-slate-600 bg-slate-950/80 px-3 py-2 text-xs text-slate-100"
        />
      </section>
    </main>
  );
}
