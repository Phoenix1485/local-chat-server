import { Suspense } from 'react';
import AdminTokenClient from './AdminTokenClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function AdminTokenPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-2xl space-y-4">
          <section className="rounded-2xl border border-slate-700/80 bg-panel/70 p-5">
            <p className="text-sm text-slate-300">Token-Seite wird geladen...</p>
          </section>
        </main>
      }
    >
      <AdminTokenClient />
    </Suspense>
  );
}
