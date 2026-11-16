import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Komunyon',
    short_name: 'Komunyon',
    description: 'Bible studies and communion groups in The Hague.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f3efe6',
    theme_color: '#f3efe6',
    lang: 'en',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
