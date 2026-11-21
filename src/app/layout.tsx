import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { preload } from 'react-dom';
import { DATA_URLS } from '@/lib/search/protocol';
import { buildMetadata, buildWebSiteJsonLd, serializeJsonLd } from '@/lib/seo';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = buildMetadata();

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Dark is the default theme; the header toggle updates this tag for the session (lib/theme.ts).
  themeColor: '#0e0f14',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Start the dataset download with the HTML instead of when the search worker boots (T006). Emits
  // <link rel="preload" as="fetch" crossorigin="anonymous"> once per file; same-origin, no credentials, like the worker's fetch.
  preload(DATA_URLS.songs, { as: 'fetch', crossOrigin: 'anonymous' });
  preload(DATA_URLS.artists, { as: 'fetch', crossOrigin: 'anonymous' });
  return (
    <html lang="en" className={inter.variable} data-theme="dark">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildWebSiteJsonLd()) }} />
        {children}
      </body>
    </html>
  );
}
