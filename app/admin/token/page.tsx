import { Suspense } from 'react';
import AdminTokenClient from './AdminTokenClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function AdminTokenPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-2xl space-y-4">
          <section className="glass-panel rounded-2xl p-5">
            <p className="surface-muted text-sm">Token-Seite wird geladen...</p>
          </section>
        </main>
      }
    >
      <AdminTokenClient />
    </Suspense>
  );
}
