import type { Metadata } from 'next';
import { Figtree, Fraunces } from 'next/font/google';
import { AuthProvider } from '@/components/AuthProvider';
import { RouteGuard } from '@/components/RouteGuard';
import './globals.css';

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Komunyon — Bible studies in The Hague',
  description:
    'Host and join Bible studies and communion groups in The Hague. Street addresses stay private until a host approves you.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${fraunces.variable}`}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <RouteGuard>{children}</RouteGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
