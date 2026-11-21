import type { Metadata } from 'next';

export const SITE_NAME = 'SongHub Songbook';
export const HOME_SCREEN_TITLE = 'SongHub';
export const SITE_TITLE = 'SongHub Songbook: find your karaoke song number';
export const SITE_DESCRIPTION =
  'Look up the number of any karaoke song by title or artist. Search about 47,000 songs from your phone, even with a typo.';
export const OG_IMAGE = { url: '/og.png', width: 1200, height: 630, alt: 'SongHub Songbook: find your song number', type: 'image/png' };

/**
 * The site's absolute origin, resolved at build time (the site is a static export, so there is no request to read it from).
 * Vercel sets VERCEL_PROJECT_PRODUCTION_URL (the production domain, host only) on every build, including previews, so preview
 * builds also point at the production URL; VERCEL_URL (this deployment's host) is the fallback; local builds use localhost.
 * Both are optional and automatic: nothing has to be configured.
 */
export function resolveSiteUrl(env: Record<string, string | undefined> = process.env): URL {
  const host = (env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return new URL(host ? `https://${host}` : 'http://localhost:3000');
}

export function buildMetadata(base: URL = resolveSiteUrl()): Metadata {
  return {
    metadataBase: base,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    // The label under the icon when a guest saves the page to the iPhone home screen. Written as a plain meta tag on purpose: the
    // `appleWebApp` option (even with `capable: false`) also emits apple-mobile-web-app-status-bar-style, a standalone-mode tag, and
    // this is not an installable app.
    other: { 'apple-mobile-web-app-title': HOME_SCREEN_TITLE },
    alternates: { canonical: '/' },
    robots: { index: true, follow: true },
    icons: {
      icon: [
        { url: '/favicon.svg', type: 'image/svg+xml' },
        { url: '/favicon.ico', sizes: '48x48' },
      ],
      apple: { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      url: '/',
      locale: 'en',
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: [{ url: OG_IMAGE.url, alt: OG_IMAGE.alt }],
    },
  };
}

/** schema.org WebSite with a SearchAction that matches the real `/?q=` deep link. */
export function buildWebSiteJsonLd(base: URL = resolveSiteUrl()) {
  const origin = base.origin;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: `${origin}/`,
    description: SITE_DESCRIPTION,
    inLanguage: 'en',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${origin}/?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** JSON for a <script type="application/ld+json">: `<` is escaped so no value can close the tag. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
