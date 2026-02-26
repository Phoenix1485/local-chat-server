import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lokaler Chat-Server',
  description: 'Leichtgewichtiges Echtzeit-Chat-System mit SSE und In-Memory-Status.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="mx-auto min-h-screen max-w-5xl px-4 py-8 text-slate-100 sm:px-6">
        <header className="mb-8 flex items-center justify-between rounded-xl border border-slate-700/70 bg-panel/70 px-4 py-3 backdrop-blur">
          <Link href="/" className="text-lg font-semibold tracking-wide text-accent">
            LocalChat
          </Link>
          <nav className="flex gap-3 text-sm">
            <Link className="rounded-md bg-slate-800/80 px-3 py-1.5 hover:bg-slate-700" href="/">
              Beitreten
            </Link>
            <Link className="rounded-md bg-slate-800/80 px-3 py-1.5 hover:bg-slate-700" href="/admin">
              Admin
            </Link>
            <Link className="rounded-md bg-slate-800/80 px-3 py-1.5 hover:bg-slate-700" href="/admin/token">
              Admin-Token
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
