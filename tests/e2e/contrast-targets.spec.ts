import type { Page } from '@playwright/test';
import { ARTIST_LINKS, HEADING, INPUT, ROWS, openApp, setTheme } from './support/app';
import { contrast, roundedAtLeast } from './support/contrast';
import { STATES, prepareState } from './support/states';
import { expect, test } from './support/test';

// New in T009: contrast computed from the colours the browser really draws (both themes) against docs/SHARED_COMPONENTS.md,
// and the 44x44 minimum on every interactive element.

const THEMES = ['dark', 'light'] as const;
type Theme = (typeof THEMES)[number];

interface Probe {
  name: string;
  /** CSS selector of the element whose colour is measured. */
  selector: string;
  /** Pseudo element (the placeholder). */
  pseudo?: string;
  /** Which fill it sits on: the page or the search field's own fill. */
  on: 'page' | 'field';
  /** What the spec table says (docs/SHARED_COMPONENTS.md), per theme; null = no figure in the table (only the minimum is asserted). */
  spec: Record<Theme, number | null>;
  /** The WCAG minimum for this kind of content: 4.5 for text, 3 for icons and borders. */
  minimum: number;
  /** Which property carries the colour. */
  property?: 'color' | 'borderTopColor';
}

const ROW_TITLE = `${ROWS}:first-child > span:nth-child(3) > span:nth-child(1)`;
const ROW_ARTIST = `${ROWS}:first-child > span:nth-child(3) > span:nth-child(2)`;
const ROW_NUMBER = `${ROWS}:first-child > span:nth-child(2)`;

async function readColors(page: Page, probe: Probe): Promise<{ fg: string; bg: string }> {
  return page.evaluate(
    ({ selector, pseudo, on, property }) => {
      const el = document.querySelector(selector) as Element;
      if (!el) throw new Error(`nothing matches ${selector}`);
      const fg = getComputedStyle(el, pseudo)[property as 'color'];
      const field = (document.querySelector('#search-input') as HTMLElement).parentElement as HTMLElement;
      const bg = on === 'field' ? getComputedStyle(field).backgroundColor : getComputedStyle(document.body).backgroundColor;
      return { fg, bg };
    },
    { selector: probe.selector, pseudo: probe.pseudo ?? null, on: probe.on, property: probe.property ?? 'color' },
  );
}

async function expectProbe(page: Page, probe: Probe, theme: Theme): Promise<number> {
  const { fg, bg } = await readColors(page, probe);
  const ratio = contrast(fg, bg);
  const spec = probe.spec[theme];
  expect(ratio, `${probe.name} (${theme}): ${ratio.toFixed(2)}:1 must reach the WCAG minimum ${probe.minimum}`).toBeGreaterThanOrEqual(probe.minimum);
  if (spec !== null) {
    expect(roundedAtLeast(ratio, spec), `${probe.name} (${theme}): measured ${ratio.toFixed(2)}:1, the spec table says ${spec}:1`).toBe(true);
  }
  return ratio;
}

test.describe('contrast against the spec table (computed colours on the rendered pages)', () => {
  for (const theme of THEMES) {
    test(`results with artists and songs, ${theme} theme: title, artist line, song number, artist name, count, section label`, async ({ page }) => {
      await prepareState(page, 'results with artists');
      await setTheme(page, theme);
      const probes: Probe[] = [
        { name: 'song title', selector: ROW_TITLE, on: 'page', spec: { dark: 17.5, light: 17.2 }, minimum: 4.5 },
        { name: 'song artist line', selector: ROW_ARTIST, on: 'page', spec: { dark: 8.6, light: 7.5 }, minimum: 4.5 },
        { name: 'song number', selector: ROW_NUMBER, on: 'page', spec: { dark: 12.4, light: 6.2 }, minimum: 4.5 },
        { name: 'artist match name', selector: `${ARTIST_LINKS}:first-of-type > span[aria-hidden]:nth-of-type(2)`, on: 'page', spec: { dark: 17.5, light: 17.2 }, minimum: 4.5 },
        { name: 'artist match count', selector: `${ARTIST_LINKS} > span:nth-child(3)`, on: 'page', spec: { dark: 8.6, light: 7.5 }, minimum: 4.5 },
        { name: 'artist match chevron (icon)', selector: `${ARTIST_LINKS} > svg`, on: 'page', spec: { dark: 6.0, light: 4.6 }, minimum: 3 },
        { name: 'section label (muted)', selector: 'main section[aria-label="Artists"] h2', on: 'page', spec: { dark: 6.0, light: 4.6 }, minimum: 4.5 },
      ];
      for (const probe of probes) await expectProbe(page, probe, theme);
    });

    test(`home and empty and hint, ${theme} theme: muted text, secondary text, icons`, async ({ page }) => {
      await prepareState(page, 'home');
      await setTheme(page, theme);
      await expectProbe(page, { name: 'home title (primary)', selector: '#home-title', on: 'page', spec: { dark: 17.5, light: 17.2 }, minimum: 4.5 }, theme);
      await expectProbe(page, { name: 'home line (secondary)', selector: '#home-title + p', on: 'page', spec: { dark: 8.6, light: 7.5 }, minimum: 4.5 }, theme);
      await expectProbe(page, { name: 'home count line (muted)', selector: '#home-title + p + p', on: 'page', spec: { dark: 6.0, light: 4.6 }, minimum: 4.5 }, theme);
      await expectProbe(page, { name: 'home note icon (accent)', selector: '#home-title ~ *, section[aria-labelledby="home-title"] > svg', on: 'page', spec: { dark: 12.4, light: 6.2 }, minimum: 3 }, theme);
      await expectProbe(page, { name: 'header toggle icon (secondary)', selector: 'header button', on: 'page', spec: { dark: 8.6, light: 7.5 }, minimum: 3 }, theme);

      await openApp(page, '/?q=xyzqq');
      await setTheme(page, theme);
      await page.getByRole('heading', { name: 'No songs found' }).waitFor();
      await expectProbe(page, { name: 'empty title', selector: '#no-results-title', on: 'page', spec: { dark: 17.5, light: 17.2 }, minimum: 4.5 }, theme);
      await expectProbe(page, { name: 'empty echo (secondary)', selector: '#no-results-title + p', on: 'page', spec: { dark: 8.6, light: 7.5 }, minimum: 4.5 }, theme);
      await expectProbe(page, { name: 'empty hint (muted)', selector: '#no-results-title + p + p', on: 'page', spec: { dark: 6.0, light: 4.6 }, minimum: 4.5 }, theme);
      await expectProbe(page, { name: 'empty icon (muted)', selector: 'section[aria-labelledby="no-results-title"] > svg', on: 'page', spec: { dark: 6.0, light: 4.6 }, minimum: 3 }, theme);

      await openApp(page, '/?q=love');
      await setTheme(page, theme);
      await page.getByText('Showing the top 50 matches').waitFor();
      await expectProbe(page, { name: 'hint row (muted)', selector: 'main ul[aria-label="Song results"] + p', on: 'page', spec: { dark: 6.0, light: 4.6 }, minimum: 4.5 }, theme);
    });

    test(`search field, ${theme} theme: placeholder, typed text, clear icon, idle border and focus border`, async ({ page }) => {
      await openApp(page);
      await setTheme(page, theme);
      await page.locator(INPUT).blur();
      await expectProbe(page, { name: 'placeholder on the field fill', selector: INPUT, pseudo: '::placeholder', on: 'field', spec: { dark: 4.9, light: 4.6 }, minimum: 4.5 }, theme);
      await expectProbe(page, { name: 'magnifier (muted) on the field fill', selector: '#search-input ~ *, #search-input ~ svg, [role="search"] svg', on: 'field', spec: { dark: null, light: null }, minimum: 3 }, theme);
      const overlay = '[role="search"] div.pointer-events-none';
      // idle border against the page and against the fill (non-text contrast 3:1, A-010)
      for (const on of ['page', 'field'] as const) {
        const r = await expectProbe(page, { name: `idle border against the ${on}`, selector: overlay, property: 'borderTopColor', on, spec: { dark: null, light: null }, minimum: 3 }, theme);
        expect(r).toBeGreaterThanOrEqual(3);
      }
      await page.locator(INPUT).fill('hotel');
      await expectProbe(page, { name: 'typed text on the field fill', selector: INPUT, on: 'field', spec: { dark: null, light: null }, minimum: 7 }, theme);
      await expectProbe(page, { name: 'clear icon (secondary) on the field fill', selector: 'button[aria-label="Clear search"]', on: 'field', spec: { dark: null, light: null }, minimum: 3 }, theme);
      await page.locator(INPUT).focus();
      await expect.poll(() => page.evaluate((s) => getComputedStyle(document.querySelector(s) as Element).borderTopWidth, overlay)).toBe('2px');
      for (const on of ['page', 'field'] as const) {
        await expectProbe(page, { name: `focus border against the ${on}`, selector: overlay, property: 'borderTopColor', on, spec: { dark: on === 'page' ? 12.4 : null, light: on === 'page' ? 6.2 : null }, minimum: 3 }, theme);
      }
    });

    test(`artist view, ${theme} theme: name, count, back chevron`, async ({ page }) => {
      await prepareState(page, 'artist view (568 songs)');
      await setTheme(page, theme);
      await expectProbe(page, { name: 'artist name', selector: `${HEADING} h2`, on: 'page', spec: { dark: 17.5, light: 17.2 }, minimum: 4.5 }, theme);
      await expectProbe(page, { name: 'artist count', selector: `${HEADING} p`, on: 'page', spec: { dark: 8.6, light: 7.5 }, minimum: 4.5 }, theme);
      await expectProbe(page, { name: 'back chevron', selector: `${HEADING} button`, on: 'page', spec: { dark: 17.5, light: 17.2 }, minimum: 3 }, theme);
    });

    test(`error state, ${theme} theme: message text and the Try again label on its accent fill`, async ({ page }) => {
      await prepareState(page, 'error state');
      await setTheme(page, theme);
      await expectProbe(page, { name: 'error message', selector: 'main [role="alert"] p', on: 'page', spec: { dark: 17.5, light: 17.2 }, minimum: 4.5 }, theme);
      const { fg, bg } = await page.evaluate(() => {
        const b = document.querySelector('main [role="alert"] button') as HTMLElement;
        return { fg: getComputedStyle(b).color, bg: getComputedStyle(b).backgroundColor };
      });
      const ratio = contrast(fg, bg);
      expect(ratio, `Try again label on accent (${theme}): ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }
});

interface Painted {
  tag: string;
  where: string;
  fg: string;
  bg: string;
  size: number;
  weight: number;
}

/** Every drawn text element on the page with its colour and the fill behind it. Text itself is never returned (the song book has profanity). */
async function paintedText(page: Page): Promise<Painted[]> {
  return page.evaluate(() => {
    const out: { tag: string; where: string; fg: string; bg: string; size: number; weight: number }[] = [];
    const seen = new Set<Element>();
    const walker = document.createTreeWalker(document.querySelector('body') as Node, NodeFilter.SHOW_TEXT);
    const fillBehind = (start: Element): string => {
      for (let el: Element | null = start; el; el = el.parentElement) {
        const c = getComputedStyle(el).backgroundColor;
        if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
      }
      return getComputedStyle(document.documentElement).backgroundColor;
    };
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || seen.has(el) || (node.textContent ?? '').trim() === '') continue;
      if (el.closest('.sr-only, script, style, next-route-announcer')) continue;
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (rect.width === 0 || rect.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
      seen.add(el);
      out.push({ tag: el.tagName.toLowerCase(), where: el.closest('[aria-label],[aria-labelledby],header,main')?.tagName.toLowerCase() ?? 'body', fg: cs.color, bg: fillBehind(el), size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10) });
    }
    // the search box text and placeholder are painted by the input itself
    const input = document.querySelector('#search-input') as HTMLInputElement;
    const field = input.parentElement as HTMLElement;
    out.push({ tag: input.value === '' ? 'input::placeholder' : 'input', where: 'search', fg: getComputedStyle(input, input.value === '' ? '::placeholder' : null).color, bg: getComputedStyle(field).backgroundColor, size: parseFloat(getComputedStyle(input).fontSize), weight: 400 });
    return out;
  });
}

test.describe('every drawn text, every state, both themes', () => {
  for (const theme of THEMES) {
    test(`all text meets WCAG AA (4.5:1, or 3:1 for large text) on all 7 states, ${theme} theme`, async ({ page }) => {
      test.setTimeout(120_000);
      let checked = 0;
      for (const state of STATES) {
        const release = await prepareState(page, state);
        await setTheme(page, theme);
        const items = await paintedText(page);
        expect(items.length, `${state}: found drawn text`).toBeGreaterThan(0);
        for (const item of items) {
          const large = item.size >= 24 || (item.size >= 18.66 && item.weight >= 700);
          const ratio = contrast(item.fg, item.bg);
          expect(ratio, `${state} / ${theme}: <${item.tag}> in ${item.where} is ${ratio.toFixed(2)}:1 (${item.fg} on ${item.bg}, ${item.size}px)`).toBeGreaterThanOrEqual(large ? 3 : 4.5);
          checked++;
        }
        release();
      }
      expect(checked).toBeGreaterThan(40);
    });
  }
});

const INTERACTIVE = 'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';

async function interactiveBoxes(page: Page): Promise<{ name: string; width: number; height: number }[]> {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll(sel)]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { name: el.getAttribute('aria-label') ?? (el.id || el.tagName.toLowerCase()), width: r.width, height: r.height };
      });
  }, INTERACTIVE);
}

test.describe('tap targets: every interactive element is at least 44x44 CSS px', () => {
  const widths = [390, 320] as const;
  for (const width of widths) {
    test.describe(`${width}px`, () => {
      test.use({ viewport: { width, height: 800 } });
      for (const state of STATES) {
        test(`${state}`, async ({ page }) => {
          const release = await prepareState(page, state);
          const boxes = await interactiveBoxes(page);
          expect(boxes.length, 'found interactive elements').toBeGreaterThan(0);
          for (const b of boxes) {
            expect(b.width, `${b.name} is ${b.width.toFixed(1)}x${b.height.toFixed(1)}`).toBeGreaterThanOrEqual(44);
            expect(b.height, `${b.name} is ${b.width.toFixed(1)}x${b.height.toFixed(1)}`).toBeGreaterThanOrEqual(44);
          }
          release();
        });
      }
    });
  }

  test('the named controls: toggle 44x44, clear 48x48, artist rows 64px tall and full width, back 44x44, Try again 48px tall', async ({ page }) => {
    await openApp(page, '/?q=eagl');
    await page.locator(ARTIST_LINKS).first().waitFor();
    const size = (loc: ReturnType<Page['locator']>) => loc.evaluate((el) => [el.getBoundingClientRect().width, el.getBoundingClientRect().height]);
    expect(await size(page.getByRole('button', { name: 'Switch to light theme' }))).toEqual([44, 44]);
    expect(await size(page.getByRole('button', { name: 'Clear search' }))).toEqual([48, 48]);
    const link = await size(page.locator(ARTIST_LINKS).first());
    expect(link[1]).toBe(64);
    expect(link[0]).toBeGreaterThanOrEqual(390 - 1);
    await page.locator(ARTIST_LINKS).first().click();
    await page.locator(HEADING).waitFor();
    expect(await size(page.getByRole('button', { name: 'Back to results' }))).toEqual([44, 44]);

    const broken = await page.context().newPage();
    await broken.setViewportSize({ width: 390, height: 844 });
    await broken.route('**/data/songs.json', (route) => route.abort('connectionfailed'));
    await broken.goto('/?q=hotel');
    const retry = broken.getByRole('button', { name: 'Try again' });
    await retry.waitFor();
    const [w, h] = await size(retry);
    expect(h).toBe(48);
    expect(w).toBeGreaterThanOrEqual(44);
    await broken.close();
  });
});
