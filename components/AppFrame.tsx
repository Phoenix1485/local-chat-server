'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';

type NavItem = {
  href: string;
  label: string;
  desc: string;
  match: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: '/chat',
    label: 'Chat Workspace',
    desc: 'Live channels and DMs',
    match: (pathname) => pathname === '/chat' || pathname.startsWith('/chat/')
  },
  {
    href: '/profile',
    label: 'Profile Hub',
    desc: 'Identity, social and discover',
    match: (pathname) => pathname === '/profile' || pathname.startsWith('/profile/')
  },
  {
    href: '/admin',
    label: 'Admin Control',
    desc: 'Moderation and system actions',
    match: (pathname) => pathname === '/admin'
  },
  {
    href: '/admin/token',
    label: 'Token Manager',
    desc: 'Generate and rotate admin keys',
    match: (pathname) => pathname === '/admin/token'
  },
  {
    href: '/',
    label: 'Auth Gateway',
    desc: 'Sign in and registration',
    match: (pathname) => pathname === '/'
  }
];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  const activeItem = useMemo(
    () => NAV_ITEMS.find((item) => item.match(pathname)) ?? NAV_ITEMS[0],
    [pathname]
  );

  return (
    <div className={`app-layout-shell ${sidebarExpanded ? 'sidebar-open' : 'sidebar-collapsed'}`}>
      <aside className="app-sidebar">
        <div className="app-sidebar-head">
          <Link href="/" className="top-brand">
            <span className="top-brand-dot" />
            LocalChat
          </Link>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarExpanded((prev) => !prev)}
            aria-label={sidebarExpanded ? 'Navigation einklappen' : 'Navigation ausklappen'}
          >
            {sidebarExpanded ? '‹' : '›'}
          </button>
        </div>
        <p className="app-sidebar-subtitle">Hybrid UI · Discord + Reddit + WhatsApp</p>
        <nav className="app-sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = item.match(pathname);
            return (
              <Link key={item.href} className={`nav-link app-nav-link ${isActive ? 'active' : ''}`} href={item.href}>
                <span className="app-nav-link-label">{item.label}</span>
                <span className="app-nav-link-meta">{item.desc}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="app-main-area">
        <header className="top-nav">
          <div className="flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <p className="surface-muted text-[11px] uppercase tracking-[0.16em]">Realtime Collaboration</p>
              <p className="truncate text-sm font-semibold text-slate-100">
                {activeItem.label} · {activeItem.desc}
              </p>
            </div>
            <span className="top-nav-badge hidden md:inline-flex">Live-Oberfläche</span>
          </div>
        </header>
        <div className="app-shell px-3 pb-4 pt-3 sm:px-5">{children}</div>
      </div>
    </div>
  );
}
