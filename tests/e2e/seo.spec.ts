import { INPUT, ROWS, ARTIST_LINKS, HEADING, openApp, setTheme } from './support/app';
import { expect, test } from './support/test';

// New in T009 (from the SEO agent's list), against the built out/ and host-agnostic: the production origin is not known until deploy
// (A-013), so nothing here compares a host; absolute URLs are checked by shape.

const meta = (page: import('@playwright/test').Page, selector: string) =>
  page.locator(`head ${selector}`).evaluateAll((els) => els.map((el) => el.getAttribute('content') ?? el.getAttribute('href') ?? ''));

test.describe('head tags', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('exactly one title, one meta description and one canonical, with sensible lengths', async ({ page }) => {
    await expect(page.locator('head title')).toHaveCount(1);
    const title = (await page.title()).trim();
    expect(title.length).toBeGreaterThan(10);
    expect(title.length).toBeLessThanOrEqual(70);
    const description = await meta(page, 'meta[name="description"]');
    expect(description).toHaveLength(1);
    expect(description[0]?.length).toBeGreaterThanOrEqual(50);
    expect(description[0]?.length).toBeLessThanOrEqual(170);
    const canonical = await meta(page, 'link[rel="canonical"]');
    expect(canonical).toHaveLength(1);
    expect(canonical[0]).toMatch(/^https?:\/\/[^/]+\/?$/); // the home page: the origin, with or without the slash
  });

  test('Open Graph and Twitter card: absolute image URLs ending /og.png, with size and alt text', async ({ page }) => {
    for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
      const values = await meta(page, selector);
      expect(values, selector).toHaveLength(1);
      expect(values[0], selector).toMatch(/^https?:\/\/[^/\s]+\/og\.png$/);
    }
    expect(await meta(page, 'meta[property="og:type"]')).toEqual(['website']);
    expect(await meta(page, 'meta[property="og:image:width"]')).toEqual(['1200']);
    expect(await meta(page, 'meta[property="og:image:height"]')).toEqual(['630']);
    expect((await meta(page, 'meta[property="og:image:alt"]'))[0]?.length).toBeGreaterThan(5);
    expect(await meta(page, 'meta[name="twitter:card"]')).toEqual(['summary_large_image']);
    for (const selector of ['meta[property="og:title"]', 'meta[property="og:description"]', 'meta[name="twitter:title"]', 'meta[name="twitter:description"]', 'meta[property="og:url"]']) {
      const values = await meta(page, selector);
      expect(values, selector).toHaveLength(1);
      expect(values[0]?.length, selector).toBeGreaterThan(0);
    }
  });

  test('lang is en; the viewport meta allows zoom; there is exactly one robots meta and it says noindex, nofollow', async ({ page }) => {
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
    const viewport = await meta(page, 'meta[name="viewport"]');
    expect(viewport).toHaveLength(1);
    expect(viewport[0]).toContain('width=device-width');
    expect(viewport[0]).toContain('initial-scale=1');
    expect(viewport[0], 'zoom is not disabled').not.toMatch(/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/);
    expect(await meta(page, 'meta[name="robots"]')).toEqual(['noindex, nofollow']);
  });

  test('theme-color exists (dark), and the toggle updates it to light and back', async ({ page }) => {
    await page.locator(INPUT).waitFor();
    await page.waitForFunction(() => Object.keys(document.querySelector('#search-input') as Element).some((k) => k.startsWith('__reactProps')));
    const color = () => meta(page, 'meta[name="theme-color"]');
    expect(await color()).toEqual(['#0e0f14']);
    await setTheme(page, 'light');
    expect(await color()).toEqual(['#faf8f5']);
    await setTheme(page, 'dark');
    expect(await color()).toEqual(['#0e0f14']);
  });

  test('the home-screen label is SongHub, and the page does not ask to run as a standalone app', async ({ page }) => {
    expect(await meta(page, 'meta[name="apple-mobile-web-app-title"]')).toEqual(['SongHub']);
    // Not an installable app (PRD): none of the standalone-mode tags (capable, status-bar-style), no manifest.
    await expect(page.locator('head meta[name="apple-mobile-web-app-capable"], head meta[name="mobile-web-app-capable"], head meta[name="apple-mobile-web-app-status-bar-style"], head link[rel="manifest"]')).toHaveCount(0);
  });

  test('the icon links point at files that exist', async ({ page, request }) => {
    const hrefs = await page.locator('head link[rel~="icon"], head link[rel="apple-touch-icon"]').evaluateAll((els) => els.map((el) => (el as HTMLLinkElement).href));
    expect(hrefs.length).toBeGreaterThanOrEqual(3);
    for (const href of hrefs) {
      const path = new URL(href).pathname;
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
    }
  });

  test('no structured data: nothing advertises the site to search engines', async ({ page }) => {
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  });
});

test.describe('static files', () => {
  for (const [path, type] of [
    ['/robots.txt', 'text/plain'],
    ['/favicon.svg', 'image/svg+xml'],
    ['/favicon.ico', 'image/x-icon'],
    ['/apple-touch-icon.png', 'image/png'],
    ['/og.png', 'image/png'],
  ] as const) {
    test(`${path} answers 200 as ${type}`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain(type);
      expect((await res.body()).length).toBeGreaterThan(10);
    });
  }

  test('robots.txt allows crawling (link previews need it) and names no sitemap; noindex does the hiding', async ({ request }) => {
    const text = await (await request.get('/robots.txt')).text();
    expect(text).toMatch(/^User-agent: \*$/m);
    expect(text).toMatch(/^Allow: \/\s*$/m);
    expect(text).not.toMatch(/^Disallow:\s*\S/m);
    expect(text).not.toMatch(/^Sitemap:/im);
  });

  // The headers come from vercel.json (scripts/serve-out.mjs reads it), so this checks the rule that ships.
  for (const path of ['/', '/data/songs.json', '/og.png', '/robots.txt']) {
    test(`${path} carries X-Robots-Tag: noindex, nofollow and is still served 200`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      expect(res.headers()['x-robots-tag']).toBe('noindex, nofollow');
    });
  }

  /** width and height from a PNG's IHDR chunk (bytes 16..23, big endian), after the 8-byte signature. */
  function pngSize(png: Buffer): { width: number; height: number; isPng: boolean } {
    const isPng = png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    return { isPng, width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  }

  test('og.png is a 1200x630 PNG under 200 KB; the apple-touch-icon is a 180x180 PNG', async ({ request }) => {
    const og = await (await request.get('/og.png')).body();
    expect(pngSize(og)).toEqual({ isPng: true, width: 1200, height: 630 });
    expect(og.length).toBeLessThan(200 * 1024);
    const touch = await (await request.get('/apple-touch-icon.png')).body();
    expect(pngSize(touch)).toEqual({ isPng: true, width: 180, height: 180 });
  });

  test('favicon.ico is an ICO file holding 32 and 48 pixel images', async ({ request }) => {
    const ico = await (await request.get('/favicon.ico')).body();
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2)], 'ICO header: reserved 0, type 1').toEqual([0, 1]);
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => ico[6 + i * 16] || 256).sort((a, b) => a - b);
    expect(sizes).toEqual([32, 48]);
  });
});

test.describe('privacy', () => {
  test('a visit (home, a search, an artist) makes requests to the site\'s own origin only: no third party, no analytics', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? '').origin;
    const seen: string[] = [];
    page.on('request', (r) => seen.push(r.url()));
    await openApp(page, '/?q=eagl');
    await page.locator(ARTIST_LINKS).first().waitFor();
    await page.locator(ROWS).first().waitFor();
    await page.locator(ARTIST_LINKS).first().click();
    await page.locator(HEADING).waitFor();
    await page.waitForLoadState('networkidle');
    const external = seen.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== origin);
    expect(external, 'requests outside the site origin').toEqual([]);
    expect(seen.length).toBeGreaterThan(5);
  });

  test('no script on the page comes from elsewhere, and nothing is stored on the device', async ({ page, baseURL }) => {
    await openApp(page, '/?q=eagl');
    const scripts = await page.locator('script[src]').evaluateAll((els) => els.map((el) => (el as HTMLScriptElement).src));
    expect(scripts.length).toBeGreaterThan(0);
    for (const src of scripts) expect(new URL(src).origin).toBe(new URL(baseURL ?? '').origin);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length + document.cookie.length)).toBe(0);
    expect(await page.evaluate(async () => (await indexedDB.databases()).length)).toBe(0);
    expect(await page.context().cookies()).toEqual([]);
  });
});
