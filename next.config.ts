import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'continuity-32390.firebaseapp.com';
    const origin = authDomain.includes('firebaseapp.com')
      ? `https://${authDomain}`
      : 'https://continuity-32390.firebaseapp.com';
    return [
      { source: '/__/auth/:path*', destination: `${origin}/__/auth/:path*` },
      { source: '/__/firebase/:path*', destination: `${origin}/__/firebase/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: '/((?!__).*)',
        headers: [
          // Lets the Google sign-in window talk back to this page.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/logout',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default nextConfig;
