import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOME_SCREEN_TITLE, OG_IMAGE, buildMetadata, resolveSiteUrl } from '@/lib/seo';

describe('site URL', () => {
  it('uses the Vercel production host, with https', () => {
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'songs.example.com', VERCEL_URL: 'x-abc.vercel.app' }).href).toBe('https://songs.example.com/');
  });
  it('falls back to VERCEL_URL, then to localhost', () => {
    expect(resolveSiteUrl({ VERCEL_URL: 'x-abc.vercel.app' }).href).toBe('https://x-abc.vercel.app/');
    expect(resolveSiteUrl({}).href).toBe('http://localhost:3000/');
  });
  it('tolerates a scheme or trailing slash and empty values', () => {
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'https://songs.example.com/' }).href).toBe('https://songs.example.com/');
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: '', VERCEL_URL: 'a.vercel.app' }).href).toBe('https://a.vercel.app/');
  });
});

describe('metadata', () => {
  const md = buildMetadata(new URL('https://songs.example.com'));
  it('is hidden from search engines (A-015), canonical to the root, with a card image of 1200x630', () => {
    expect(md.robots).toEqual({ index: false, follow: false });
    expect(md.alternates?.canonical).toBe('/');
    expect(String(md.metadataBase)).toBe('https://songs.example.com/');
    expect(OG_IMAGE).toMatchObject({ width: 1200, height: 630, url: '/og.png' });
    expect(md.twitter).toMatchObject({ card: 'summary_large_image' });
  });
  it('keeps the description a sensible length', () => {
    expect(String(md.description).length).toBeLessThanOrEqual(160);
  });
  it('the title shown under a home-screen shortcut is the short brand name, with no standalone-app tags', () => {
    expect(md.other).toEqual({ 'apple-mobile-web-app-title': HOME_SCREEN_TITLE });
    expect(md.appleWebApp, 'appleWebApp would also emit a status-bar-style tag').toBeUndefined();
    expect(HOME_SCREEN_TITLE).toBe('SongHub');
  });
});

/** Every drawn shape (circle or path) of an SVG fragment, as { tag, attrs } with sorted attributes, in source order. */
interface Shape {
  tag: 'circle' | 'path';
  attrs: Record<string, string>;
}
function shapesOf(markup: string): Shape[] {
  const out: Shape[] = [];
  for (const m of markup.matchAll(/<(circle|path)\b([^>]*?)\/?>/g)) {
    const attrs: Record<string, string> = {};
    for (const a of (m[2] ?? '').matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1] as string] = a[2] as string;
    out.push({ tag: m[1] as Shape['tag'], attrs });
  }
  return out;
}
/** Bounding box [x0, y0, x1, y1] of shapes drawn with circles and the M/L/H/V/h/v/z path commands the note uses. */
function bounds(shapes: Shape[]): [number, number, number, number] {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const { tag, attrs } of shapes) {
    if (tag === 'circle') {
      const [cx, cy, r] = [Number(attrs.cx), Number(attrs.cy), Number(attrs.r)];
      xs.push(cx - r, cx + r);
      ys.push(cy - r, cy + r);
      continue;
    }
    let x = 0;
    let y = 0;
    for (const c of (attrs.d ?? '').matchAll(/([MLHVhvz])([^MLHVhvz]*)/g)) {
      const n = (c[2] ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
      const cmd = c[1];
      if (cmd === 'M' || cmd === 'L') [x, y] = [n[0] as number, n[1] as number];
      else if (cmd === 'H') x = n[0] as number;
      else if (cmd === 'V') y = n[0] as number;
      else if (cmd === 'h') x += n[0] as number;
      else if (cmd === 'v') y += n[0] as number;
      else if (cmd === 'z') continue;
      xs.push(x);
      ys.push(y);
    }
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

describe('the brand assets draw the header icon', () => {
  const iconsSource = readFileSync('src/components/icons.tsx', 'utf8');
  const fn = iconsSource.slice(iconsSource.indexOf('export function MusicNoteIcon'), iconsSource.indexOf('export function SearchIcon'));
  const header = shapesOf(fn);
  const sources: Record<string, string> = {
    'public/favicon.svg': readFileSync('public/favicon.svg', 'utf8'),
    'scripts/brand/apple-touch-icon.svg': readFileSync('scripts/brand/apple-touch-icon.svg', 'utf8'),
    'scripts/brand/og.html (the card)': readFileSync('scripts/brand/og.html', 'utf8').slice(readFileSync('scripts/brand/og.html', 'utf8').indexOf('<body>')),
  };

  it('the header icon has the shapes this test expects to compare (two heads, two stems, one beam)', () => {
    expect(header.filter((s) => s.tag === 'circle')).toHaveLength(2);
    expect(header.filter((s) => s.tag === 'path')).toHaveLength(2);
  });

  for (const [name, source] of Object.entries(sources)) {
    it(`${name} has every shape of the header icon, same attributes, same order, and nothing else`, () => {
      expect(shapesOf(source)).toEqual(header);
    });
  }

  it('the favicon and the touch icon keep the note centred inside the square with the same scale', () => {
    const [x0, y0, x1, y1] = bounds(header);
    for (const name of ['public/favicon.svg', 'scripts/brand/apple-touch-icon.svg']) {
      const svg = sources[name] as string;
      const t = /translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/.exec(svg);
      expect(t, `${name} has a translate/scale`).not.toBeNull();
      const [tx, ty, k] = [Number(t?.[1]), Number(t?.[2]), Number(t?.[3])];
      const box = { l: tx + x0 * k, t: ty + y0 * k, r: tx + x1 * k, b: ty + y1 * k };
      expect(Math.abs(box.l - (64 - box.r)), `${name}: left and right margins`).toBeLessThan(1);
      expect(Math.abs(box.t - (64 - box.b)), `${name}: top and bottom margins`).toBeLessThan(1);
      expect(box.l, `${name}: the note is not cramped`).toBeGreaterThanOrEqual(8);
      expect(box.t).toBeGreaterThanOrEqual(8);
    }
    expect(sources['public/favicon.svg']).toContain('translate(5.6 4.2) scale(2.2)');
    expect(sources['scripts/brand/apple-touch-icon.svg']).toContain('translate(5.6 4.2) scale(2.2)');
  });

  it('the card draws the icon on the 24-unit grid of the header icon', () => {
    expect(sources['scripts/brand/og.html (the card)']).toMatch(/<svg viewBox="0 0 24 24"/);
  });
});

describe('hidden from search engines (A-015)', () => {
  it('vercel.json sends X-Robots-Tag: noindex, nofollow for every path', () => {
    const rules = (JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] }).headers;
    const rule = rules.find((r) => r.headers.some((h) => h.key === 'X-Robots-Tag'));
    expect(rule?.source).toBe('/(.*)');
    expect(rule?.headers.find((h) => h.key === 'X-Robots-Tag')?.value).toBe('noindex, nofollow');
  });
  it('robots.txt allows crawling so link-preview bots can fetch the page; noindex does the hiding', () => {
    const text = readFileSync('public/robots.txt', 'utf8');
    expect(text).toMatch(/^User-agent: \*$/m);
    expect(text).toMatch(/^Allow: \/\s*$/m);
    expect(text).not.toMatch(/^Disallow:\s*\S/m); // a Disallow would stop Slack and others from building the preview
  });
  it('no structured data is injected: a SearchAction would advertise the site to search engines', () => {
    expect(readFileSync('src/app/layout.tsx', 'utf8')).not.toContain('ld+json');
  });
});
