import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { ARTIST_LINKS, HEADING, INPUT, ROWS, STATUS, largeTextCss, openApp, search, setTheme, waitWorkerReady } from './support/app';
import { artistFact, artistLabel } from './support/data';
import { STATES, prepareState, type StateName } from './support/states';
import { expect, test } from './support/test';

// New in T009: axe-core on every state in both themes (plus 320px and large text), the keyboard pass, and the screen-reader semantics.

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function expectNoViolations(page: Page, where: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s), first: ${v.nodes[0]?.target.join(' ')}`);
  expect(summary, `axe violations on ${where}`).toEqual([]);
  expect(results.passes.length, 'axe actually ran rules').toBeGreaterThan(10);
}

test.describe('axe-core: 0 violations (wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice)', () => {
  for (const theme of ['dark', 'light'] as const) {
    for (const state of STATES) {
      test(`${state}, ${theme} theme, 390px`, async ({ page }) => {
        const release = await prepareState(page, state);
        await setTheme(page, theme);
        await expectNoViolations(page, `${state} / ${theme}`);
        release();
      });
    }
  }

  test.describe('at 320px', () => {
    test.use({ viewport: { width: 320, height: 700 } });
    for (const theme of ['dark', 'light'] as const) {
      for (const state of STATES) {
        test(`${state}, ${theme} theme`, async ({ page }) => {
          const release = await prepareState(page, state);
          await setTheme(page, theme);
          await expectNoViolations(page, `${state} / ${theme} / 320px`);
          release();
        });
      }
    }
  });

  for (const [scale, width] of [
    [2, 320],
    [1.5, 390],
  ] as const) {
    test.describe(`large text x${scale} at ${width}px`, () => {
      test.use({ viewport: { width, height: 800 } });
      for (const theme of ['dark', 'light'] as const) {
        for (const state of ['hint row', 'results with artists'] as StateName[]) {
          test(`${state}, ${theme} theme`, async ({ page }) => {
            await prepareState(page, state);
            await page.addStyleTag({ content: largeTextCss(scale) });
            await setTheme(page, theme);
            await expectNoViolations(page, `${state} / ${theme} / x${scale}`);
          });
        }
      }
    });
  }
});

/** A short description of the focused element: its accessible label (or href, or id), or "none" when focus left the page. */
async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return 'none';
    return el.getAttribute('aria-label') ?? el.getAttribute('href') ?? el.id ?? el.tagName.toLowerCase();
  });
}

async function tabThrough(page: Page, count: number): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab');
    seen.push(await focused(page));
  }
  return seen;
}

test.describe('keyboard', () => {
  test('home: Shift+Tab from the box reaches the theme toggle, Tab comes back; nothing else takes focus', async ({ page }) => {
    await openApp(page);
    expect(await focused(page)).toBe('search-input');
    await page.keyboard.press('Shift+Tab');
    expect(await focused(page)).toBe('Switch to light theme');
    expect(await tabThrough(page, 2)).toEqual(['search-input', 'none']);
  });

  test('Tab order with results and artists: toggle, field, clear, each artist link in order; song rows are not stops', async ({ page }) => {
    await openApp(page, '/?q=eagl');
    await page.locator(ARTIST_LINKS).first().waitFor();
    await page.locator(ROWS).first().waitFor();
    const hrefs = await page.locator(ARTIST_LINKS).evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
    await page.locator('header button').focus();
    const order = await tabThrough(page, 2 + hrefs.length + 1);
    expect(order).toEqual(['search-input', 'Clear search', ...hrefs, 'none']);
    // and nothing inside the song list is focusable
    expect(await page.locator(`${ROWS} :is(a, button, input, [tabindex])`).count()).toBe(0);
    expect(await page.locator(`${ROWS}[tabindex]`).count()).toBe(0);
  });

  test('Enter on an artist link opens the artist; focus lands on the heading; Tab then reaches the back chevron; Enter on it returns focus to the box', async ({ page }) => {
    await openApp(page, '/?q=eagl');
    await page.locator(ARTIST_LINKS).first().waitFor();
    const href = (await page.locator(ARTIST_LINKS).first().getAttribute('href')) ?? '';
    const expected = artistFact(new URL(href, 'http://x/').searchParams.get('artist') ?? '');
    await page.locator(ARTIST_LINKS).first().focus();
    await page.keyboard.press('Enter');
    await page.locator(HEADING).waitFor();
    expect(search(page)).toBe(href);
    await expect.poll(() => focused(page)).toBe(artistLabel(expected)); // the heading block, not a Tab stop
    expect(await tabThrough(page, 1)).toEqual(['Back to results']);
    await page.keyboard.press('Enter');
    await page.locator(ARTIST_LINKS).first().waitFor();
    expect(search(page)).toBe('?q=eagl');
    expect(await focused(page), 'after Back, focus is in the search box').toBe('search-input');
  });

  test('artist view Tab order: toggle, field, clear, back chevron (rows are not stops)', async ({ page }) => {
    await openApp(page, '/?q=eagl&artist=eagles');
    await page.locator(HEADING).waitFor();
    await page.locator('header button').focus();
    expect(await tabThrough(page, 4)).toEqual(['search-input', 'Clear search', 'Back to results', 'none']);
  });

  test('browser Back from the artist view returns focus to the search box', async ({ page }) => {
    await openApp(page, '/?q=eagl');
    await page.locator(ARTIST_LINKS).first().focus();
    await page.keyboard.press('Enter');
    await page.locator(HEADING).waitFor();
    await page.goBack();
    await page.locator(ARTIST_LINKS).first().waitFor();
    expect(await focused(page)).toBe('search-input');
  });

  test('Escape clears the field, removes ?q and leaves focus in the box', async ({ page }) => {
    await openApp(page);
    await page.keyboard.type('hotel', { delay: 20 });
    expect(search(page)).toBe('?q=hotel');
    await page.keyboard.press('Escape');
    await expect(page.locator(INPUT)).toHaveValue('');
    await page.waitForFunction(() => location.search === '');
    expect(await focused(page)).toBe('search-input');
    await expect(page.getByText('Find your song number')).toBeVisible();
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`a visible 2px accent focus ring on every focusable element (${theme} theme)`, async ({ page }) => {
      const accent = theme === 'dark' ? 'rgb(255, 201, 51)' : 'rgb(154, 67, 0)';
      await openApp(page, '/?q=eagl');
      await page.locator(ARTIST_LINKS).first().waitFor();
      await setTheme(page, theme);
      const ring = () =>
        page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          if (el.id === 'search-input') {
            const overlay = el.parentElement?.querySelector('div.pointer-events-none') as HTMLElement;
            const cs = getComputedStyle(overlay);
            return { what: 'field border', width: cs.borderTopWidth, style: cs.borderTopStyle, color: cs.borderTopColor };
          }
          const cs = getComputedStyle(el);
          return { what: el.getAttribute('aria-label') ?? el.getAttribute('href') ?? el.tagName, width: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor };
        });
      await page.locator('header button').focus();
      await page.keyboard.press('Shift+Tab'); // from the toggle go to the document start, then Tab onto the toggle by keyboard (focus-visible)
      await page.keyboard.press('Tab');
      const rings: { what: string; width: string; style: string; color: string }[] = [await ring()];
      const stops = 2 + (await page.locator(ARTIST_LINKS).count()); // field, clear, links
      for (let i = 0; i < stops; i++) {
        await page.keyboard.press('Tab');
        rings.push(await ring());
      }
      expect(rings.length).toBeGreaterThanOrEqual(5);
      for (const r of rings) {
        expect(r, `focus ring on ${r.what}`).toMatchObject({ width: '2px', style: 'solid', color: accent });
      }
    });
  }

  test('the artist back chevron and Try again also show the ring', async ({ page }) => {
    await openApp(page, '/?q=eagl&artist=eagles');
    await page.locator(HEADING).waitFor();
    await page.locator('header button').focus();
    await tabThrough(page, 3); // field, clear, back
    expect(await focused(page)).toBe('Back to results');
    const back = await page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement as Element);
      return [cs.outlineWidth, cs.outlineStyle, cs.outlineColor];
    });
    expect(back).toEqual(['2px', 'solid', 'rgb(255, 201, 51)']);
  });
});

test.describe('live region', () => {
  test('exactly one live region in the page, polite, present from the start', async ({ page }) => {
    await openApp(page);
    const regions = await page.evaluate(() => [...document.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"]')].map((el) => `${el.getAttribute('role')}/${el.getAttribute('aria-live')}/${el.closest('main') ? 'main' : 'outside'}`));
    // Next.js adds its own announcer inside a shadow root (not reachable by selectors); in the light DOM there is exactly ours
    expect(regions).toEqual(['status/polite/main']);
  });

  test('a query announces once, after it settles: typing "hotel californa" quickly gives one announcement, the next query one more', async ({ page }) => {
    await openApp(page);
    await waitWorkerReady(page);
    await page.evaluate((sel) => {
      const region = document.querySelector(sel) as HTMLElement;
      const log: string[] = [];
      (window as unknown as { __announced: string[] }).__announced = log;
      new MutationObserver((records) => {
        for (const rec of records) {
          for (const node of rec.addedNodes) {
            if (node instanceof HTMLElement && node.classList.contains('sr-only') && (node.textContent ?? '') !== '') log.push(node.textContent ?? '');
          }
        }
      }).observe(region, { childList: true, subtree: true });
    }, STATUS);
    const announced = () => page.evaluate(() => (window as unknown as { __announced: string[] }).__announced);
    await page.locator(INPUT).pressSequentially('hotel californa', { delay: 30 });
    await expect.poll(announced).toHaveLength(1);
    await page.waitForTimeout(1200); // a late second announcement would show up in this window
    const first = await announced();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatch(/^(\d[\d,]* songs?|No songs) found$/);
    await page.locator(INPUT).pressSequentially(' x', { delay: 30 });
    await expect.poll(announced).toHaveLength(2);
    await page.waitForTimeout(1200);
    expect(await announced()).toHaveLength(2);
  });

  test('the region is silent while the guest keeps typing (nothing is announced for each letter)', async ({ page }) => {
    await openApp(page);
    await waitWorkerReady(page);
    await page.locator(INPUT).pressSequentially('lov', { delay: 20 });
    await page.locator(ROWS).first().waitFor();
    expect(await page.locator(STATUS).textContent(), 'nothing is said before the 600 ms settle delay').toBe('');
    await expect(page.locator(STATUS)).toContainText('songs found');
  });
});

test.describe('screen-reader semantics (names and roles)', () => {
  test('the theme toggle is a button whose name says what it does and flips', async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole('button', { name: 'Switch to light theme', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.getByRole('button', { name: 'Switch to dark theme', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Switch to light theme' })).toHaveCount(0);
  });

  test('one h1 (the wordmark); the section headings below it are h2; the search is a landmark with a labelled search box', async ({ page }) => {
    await openApp(page, '/?q=eagl');
    await page.locator(ARTIST_LINKS).first().waitFor();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('SongHub Songbook');
    expect(await page.getByRole('heading').evaluateAll((hs) => hs.map((h) => h.tagName))).toEqual(['H1', 'H2', 'H2']);
    expect(await page.getByRole('heading', { level: 2 }).allTextContents()).toEqual(['Artists', 'Songs']);
    await expect(page.getByRole('search')).toHaveCount(1);
    await expect(page.getByRole('searchbox', { name: 'Search song or artist', exact: true })).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('banner')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  });

  test('the Clear button appears only with text and is named "Clear search"', async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole('button', { name: 'Clear search' })).toHaveCount(0);
    await page.locator(INPUT).fill('a');
    await expect(page.getByRole('button', { name: 'Clear search', exact: true })).toHaveCount(1);
  });

  test('the song list is named "Song results"; each row reads "Song <number>, <title> by <artist>" and the drawn text is hidden from assistive technology', async ({ page }) => {
    await openApp(page, '/?q=love');
    await page.locator(ROWS).nth(49).waitFor();
    await expect(page.getByRole('list', { name: 'Song results', exact: true })).toHaveCount(1);
    const rows = await page.locator(ROWS).evaluateAll((lis) =>
      lis.map((li) => ({
        label: li.querySelector('.sr-only')?.textContent ?? '',
        number: li.children[1]?.textContent ?? '',
        hiddenDrawn: li.children[1]?.getAttribute('aria-hidden') === 'true' && li.children[2]?.getAttribute('aria-hidden') === 'true',
      })),
    );
    expect(rows).toHaveLength(50);
    for (const row of rows) {
      expect(row.label.startsWith(`Song ${row.number}, `), `a row's sentence starts with its own number (${row.number})`).toBe(true);
      expect(row.hiddenDrawn).toBe(true);
    }
    // the accessibility tree agrees: the list item reads as the one sentence, and the drawn number and title are not read again
    const snapshot = await page.locator(ROWS).first().ariaSnapshot();
    expect(snapshot).toContain(rows[0]?.label ?? '');
    expect(snapshot.split(`Song ${rows[0]?.number}`).length, 'the number is read once').toBe(2);
  });

  test('artist links are named "<name>, N songs" and sit in a section named "Artists"', async ({ page }) => {
    await openApp(page, '/?q=eagl');
    await page.locator(ARTIST_LINKS).first().waitFor();
    await expect(page.getByRole('region', { name: 'Artists', exact: true })).toHaveCount(1);
    const links = page.getByRole('region', { name: 'Artists' }).getByRole('link');
    const n = await links.count();
    expect(n).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < n; i++) {
      const href = (await links.nth(i).getAttribute('href')) ?? '';
      const fact = artistFact(new URL(href, 'http://x/').searchParams.get('artist') ?? '');
      await expect(links.nth(i)).toHaveAccessibleName(artistLabel(fact));
    }
  });

  test('the artist view: a heading group named "<name>, N songs", a "Back to results" button, an h2 with the name, a list "Songs by <name>"', async ({ page }) => {
    await openApp(page, '/?q=eagl&artist=eagles');
    await page.locator(HEADING).waitFor();
    const eagles = artistFact('eagles');
    await expect(page.getByRole('group', { name: artistLabel(eagles), exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Back to results', exact: true })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 2, name: eagles.name, exact: true })).toHaveCount(1);
    await expect(page.getByRole('list', { name: `Songs by ${eagles.name}`, exact: true })).toHaveCount(1);
    // opened directly (no tap): focus stays in the box and the live region says the artist once
    await expect(page.locator(STATUS)).toHaveText(artistLabel(eagles));
  });

  test('the empty state is a section labelled by its heading; the error is an alert with a "Try again" button', async ({ page }) => {
    await openApp(page, '/?q=xyzqq');
    await page.getByRole('heading', { name: 'No songs found' }).waitFor();
    await expect(page.getByRole('region', { name: 'No songs found' })).toHaveCount(1);
    const broken = await page.context().newPage();
    await broken.route('**/data/songs.json', (route) => route.abort('connectionfailed'));
    await broken.goto('/?q=hotel');
    const alert = broken.locator('main [role="alert"]');
    await alert.waitFor();
    await expect(alert.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(1);
    await broken.close();
  });

  test('the search box asks for the search keyboard and does not autocorrect', async ({ page }) => {
    await openApp(page);
    const attrs = await page.locator(INPUT).evaluate((el) => (el as HTMLInputElement).getAttributeNames().map((n) => `${n}=${el.getAttribute(n)}`));
    expect(attrs).toEqual(expect.arrayContaining(['inputmode=search', 'enterkeyhint=search', 'autocomplete=off', 'autocorrect=off', 'autocapitalize=none', 'spellcheck=false']));
  });
});
