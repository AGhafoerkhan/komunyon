import type { Metadata, Viewport } from 'next';
import { Figtree, Fraunces } from 'next/font/google';
import { AuthProvider } from '@/components/AuthProvider';
import { NoticePermission } from '@/components/DeviceNotices';
import { PwaRegister } from '@/components/PwaRegister';
import { RouteGuard } from '@/components/RouteGuard';
import { ThemeProvider } from '@/components/ThemeProvider';
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f3efe6',
};

export const metadata: Metadata = {
  applicationName: 'Komunyon',
  title: 'Komunyon — Bible studies in The Hague',
  description:
    'Find a Bible study in The Hague, meet the people hosting it, or host your own. The street address opens after the host approves you.',
  appleWebApp: {
    capable: true,
    title: 'Komunyon',
    statusBarStyle: 'default',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${fraunces.variable}`}>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <AuthProvider>
            <PwaRegister />
            <NoticePermission />
            <RouteGuard>{children}</RouteGuard>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
