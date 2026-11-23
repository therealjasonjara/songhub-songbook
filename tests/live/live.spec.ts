import { INPUT, openApp } from '../e2e/support/app';
import { LIVE_ORIGIN } from '../e2e/support/live';
import { expect, test } from '../e2e/support/test';

// Live-only checks (T010): what the real CDN does that the local server only imitates. Read-only (GET/HEAD and a browser).
// Nothing here is a title or a song: counts, sizes and headers only.

const ORIGIN = LIVE_ORIGIN ?? '';
const DATA = ['/data/songs.json', '/data/artists.json'];
const MB_1_5 = 1_500_000;

test.describe('transport', () => {
  test('http:// redirects to https:// with a permanent redirect, to the same host and path', async ({ request }) => {
    const http = ORIGIN.replace(/^https:/, 'http:');
    test.skip(!ORIGIN.startsWith('https:'), 'the deployment is not https');
    for (const path of ['/', '/?q=eagl']) {
      const res = await request.get(http + path, { maxRedirects: 0 });
      expect([301, 307, 308], `status for ${path}`).toContain(res.status());
      expect(res.headers().location, 'redirect target').toBe(ORIGIN + path);
    }
  });

  test('the page and the data files are served over HTTP/2 or newer', async ({ page }) => {
    await openApp(page);
    const protocols = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return { nav: nav.nextHopProtocol, assets: [...new Set(res.filter((r) => r.name.includes('/_next/') || r.name.includes('/data/')).map((r) => r.nextHopProtocol))] };
    });
    expect(protocols.nav).toMatch(/^h2|^h3/);
    expect(protocols.assets.length).toBeGreaterThan(0);
    for (const p of protocols.assets) expect(p, 'asset protocol').toMatch(/^h2|^h3/);
  });
});

test.describe('the dataset on the wire', () => {
  for (const path of DATA) {
    test(`${path} is compressed (br or gzip) when the client accepts it`, async ({ request }) => {
      const res = await request.get(path, { headers: { 'accept-encoding': 'br, gzip' } });
      expect(res.status()).toBe(200);
      expect(res.headers()['content-encoding'], 'content-encoding').toMatch(/^(br|gzip)$/);
      expect(res.headers()['content-type']).toContain('application/json');
      // Vercel sends no `Vary: Accept-Encoding` on static files (it picks the encoding at the edge), so none is asserted.
    });
  }

  test('both files together transfer under 1.5 MB (compressed bytes the browser really received, cold cache)', async ({ page }) => {
    await openApp(page, '/?q=hotel');
    await page.waitForFunction(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((r) => r.name.includes('/data/') && r.responseEnd > 0).length >= 2);
    const sizes = await page.evaluate(() => {
      const out: Record<string, { encoded: number; transfer: number; decoded: number }> = {};
      for (const r of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
        if (!r.name.includes('/data/')) continue;
        const key = new URL(r.name).pathname;
        const prev = out[key];
        // the preload sends the bytes; the worker's later request revalidates (small): keep the larger of the two
        if (!prev || r.encodedBodySize > prev.encoded) out[key] = { encoded: r.encodedBodySize, transfer: r.transferSize, decoded: r.decodedBodySize };
      }
      return out;
    });
    expect(Object.keys(sizes).sort()).toEqual([...DATA].sort());
    const encoded = Object.values(sizes).reduce((a, s) => a + s.encoded, 0);
    const decoded = Object.values(sizes).reduce((a, s) => a + s.decoded, 0);
    process.stdout.write(`     live data on the wire: ${encoded} B encoded for ${decoded} B decoded (${Object.entries(sizes).map(([k, s]) => `${k.split('/').pop()} ${s.encoded}`).join(', ')})\n`);
    expect(encoded, 'encoded bytes').toBeGreaterThan(100_000);
    expect(encoded, 'under 1.5 MB').toBeLessThan(MB_1_5);
    expect(decoded, 'it really was compressed').toBeGreaterThan(encoded);
  });
});

test.describe('caching headers', () => {
  test('/_next/static/* files are immutable, one year', async ({ page, request }) => {
    await page.goto('/');
    const urls = await page.evaluate(() => [...document.querySelectorAll('script[src], link[rel="stylesheet"][href]')].map((el) => (el as HTMLScriptElement).src || (el as HTMLLinkElement).href).filter((u) => new URL(u).pathname.startsWith('/_next/static/')));
    expect(urls.length, 'static assets referenced by the page').toBeGreaterThan(2);
    for (const url of urls) {
      const res = await request.get(url);
      expect(res.status(), url).toBe(200);
      const cc = res.headers()['cache-control'] ?? '';
      expect(cc, new URL(url).pathname).toContain('immutable');
      expect(cc, new URL(url).pathname).toMatch(/max-age=31536000/);
    }
  });

  for (const path of DATA) {
    test(`${path} is revalidated every time (max-age=0, must-revalidate), has an ETag, and a repeat request answers 304`, async ({ request }) => {
      const first = await request.get(path);
      expect(first.status()).toBe(200);
      expect(first.headers()['cache-control']).toBe('public, max-age=0, must-revalidate');
      const etag = first.headers().etag;
      expect(etag, 'etag').toBeTruthy();
      const again = await request.get(path, { headers: { 'if-none-match': etag as string } });
      expect(again.status(), 'conditional repeat').toBe(304);
      expect((await again.body()).length).toBe(0);
      // Vercel sends a weak ETag (W/"x") on a compressed 200 and the strong form on the 304: the same validator
      expect(again.headers().etag?.replace(/^W\//, '')).toBe((etag as string).replace(/^W\//, ''));
    });
  }

  test('the page itself is revalidated, so a new deployment shows at once (no stale HTML)', async ({ request }) => {
    const res = await request.get('/');
    expect(res.headers()['cache-control']).toMatch(/max-age=0/);
    expect(res.headers()['cache-control']).toMatch(/must-revalidate/);
  });

  test('a browser reload re-requests the data with a conditional request and the page still works from it (data-version safety)', async ({ page }) => {
    await openApp(page, '/?q=hotel');
    await page.locator('main ul[aria-label="Song results"] > li').first().waitFor();
    const statuses: number[] = [];
    page.on('response', (r) => {
      if (r.url().endsWith('/data/songs.json')) statuses.push(r.status());
    });
    await page.reload();
    await page.locator(INPUT).waitFor();
    await page.locator('main ul[aria-label="Song results"] > li').first().waitFor();
    expect(statuses.length, 'songs.json requested after the reload').toBeGreaterThan(0);
    expect(statuses.every((s) => s === 200 || s === 304)).toBe(true);
  });
});

test.describe('unknown paths', () => {
  for (const path of ['/definitely-not-a-page', '/data/nope.json', '/artist/123']) {
    test(`${path} answers 404 with the 404 page and X-Robots-Tag: noindex`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(404);
      expect(res.headers()['x-robots-tag']).toBe('noindex, nofollow');
      expect(res.headers()['content-type']).toContain('text/html');
      const body = await res.text();
      expect(body).toMatch(/404/);
      expect(body, 'the app\'s own 404 page, not the platform\'s').not.toContain('NOT_FOUND');
    });
  }

  // Under /_next/static/ Vercel answers a missing file with a plain-text 404, not the app's 404 page (CDN behaviour, not the app).
  test('a missing /_next/static/ file answers 404 and still carries X-Robots-Tag: noindex', async ({ request }) => {
    const res = await request.get('/_next/static/nope.js');
    expect(res.status()).toBe(404);
    expect(res.headers()['x-robots-tag']).toBe('noindex, nofollow');
    process.stdout.write(`     missing /_next/static file: ${res.headers()['content-type']}, cache-control ${res.headers()['cache-control']}\n`);
  });
});
