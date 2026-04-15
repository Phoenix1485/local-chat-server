import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'LocalChat Next',
  description: 'Lokaler Discord-inspirierter Chat mit Konten, Freunden, Direktnachrichten, Gruppen und Rollen.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen text-slate-100">
        <header className="top-nav">
          <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
            <Link href="/" className="top-brand">
              <span className="top-brand-dot" />
              LocalChat
            </Link>
            <span className="top-nav-badge hidden md:inline-flex">Live-Oberfläche</span>
            <nav className="flex flex-wrap justify-end gap-2 text-sm">
              <Link className="nav-link" href="/">
                Anmeldung
              </Link>
              <Link className="nav-link" href="/chat">
                Chat
              </Link>
              <Link className="nav-link" href="/profile">
                Profil
              </Link>
              <Link className="nav-link" href="/admin">
                Admin
              </Link>
              <Link className="nav-link" href="/admin/token">
                Admin-Token
              </Link>
            </nav>
          </div>
        </header>
        <div className="app-shell mx-auto w-full max-w-[1600px] px-4 pb-6 sm:px-6">{children}</div>
      </body>
    </html>
  );
}
