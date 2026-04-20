import type { Metadata } from 'next';
import './globals.css';
import { AppFrame } from '@/components/AppFrame';

export const metadata: Metadata = {
  title: 'LocalChat Next',
  description: 'Lokaler Discord-inspirierter Chat mit Konten, Freunden, Direktnachrichten, Gruppen und Rollen.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen text-slate-100">
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
