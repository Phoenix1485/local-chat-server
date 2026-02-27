import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'LocalChat Next',
  description: 'Lokaler Discord-inspirierter Chat mit Accounts, Friends, DMs, Gruppen und Rollen.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen text-slate-100">
        <header className="top-nav">
          <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-4 px-3 py-3 sm:px-4">
            <Link href="/" className="top-brand">
              <span className="top-brand-dot" />
              LocalChat
            </Link>
            <span className="top-nav-badge hidden md:inline-flex">Live UI</span>
            <nav className="flex flex-wrap justify-end gap-2 text-sm">
              <Link className="nav-link" href="/">
                Auth
              </Link>
              <Link className="nav-link" href="/chat">
                Chat
              </Link>
              <Link className="nav-link" href="/profile">
                Profile
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
        <div className="app-shell mx-auto w-full max-w-[1500px] px-3 pb-4 sm:px-4">{children}</div>
      </body>
    </html>
  );
}
