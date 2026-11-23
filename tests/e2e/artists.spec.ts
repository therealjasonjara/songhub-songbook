import { ARTIST_LINKS, ARTIST_ROWS, HEADING, INPUT, ROWS, STATUS, openApp, search } from './support/app';
import { artistFact, artistLabel, countText } from './support/data';
import { expect, test } from './support/test';

// Smoke steps ported: 12 (artists above songs: hrefs, link name, no labels when none, empty), 13 (open an artist, count, Back/Forward,
// history, focus, live region), 14 (Back restores scroll), 15 (editing leaves the view; clearing goes home), 16 (deep links, dotted id, hostile ids).

const idOf = (href: string | null): string | null => new URL(href ?? '', 'http://x/').searchParams.get('artist');

test.describe('artist rows', () => {
  test('typing eagl shows 1 to 3 real links above the songs, each named "<name>, N songs"', async ({ page, problems }) => {
    await openApp(page);
    await page.keyboard.type('eagl', { delay: 40 });
    await page.locator(ARTIST_LINKS).first().waitFor();
    await page.locator(ROWS).first().waitFor();
    const hrefs = await page.locator(ARTIST_LINKS).evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
    expect(hrefs.length).toBeGreaterThanOrEqual(1);
    expect(hrefs.length).toBeLessThanOrEqual(3);
    for (const href of hrefs) expect(href).toMatch(/^\?q=eagl&artist=[^&]+$/);
    const first = artistFact(idOf(hrefs[0] ?? '') ?? '');
    await expect(page.getByRole('link', { name: artistLabel(first), exact: true })).toHaveCount(1);
    expect(await page.locator(ARTIST_LINKS).first().locator(':scope > span').nth(2).textContent()).toBe(countText(first.count));
    expect(problems).toEqual([]);
  });

  test('ARTISTS and SONGS labels and artist rows leave with the query: none when nothing is suggested, none for no results', async ({ page }) => {
    await openApp(page, '/?q=eagl');
    await page.locator(ARTIST_LINKS).first().waitFor();
    await page.locator(INPUT).fill('hotel californa');
    // The old rows stay until the new answer arrives, so wait for the artists of the old query to go.
    await page.locator(ARTIST_LINKS).first().waitFor({ state: 'detached' });
    await page.locator(ROWS).first().waitFor();
    await expect(page.locator('main h2', { hasText: /^(Artists|Songs)$/ })).toHaveCount(0);
    await page.locator(INPUT).fill('xyzqq');
    await page.getByRole('heading', { name: 'No songs found' }).waitFor();
    await expect(page.locator(ARTIST_LINKS)).toHaveCount(0);
  });
});

test.describe('the artist view and history', () => {
  test('tapping an artist opens the view (count equals the dataset, every song a row); Back, Forward and the chevron return', async ({ page }) => {
    await openApp(page);
    await page.keyboard.type('eagl', { delay: 40 });
    await page.locator(ARTIST_LINKS).first().waitFor();
    const href = (await page.locator(ARTIST_LINKS).first().getAttribute('href')) ?? '';
    const expected = artistFact(idOf(href) ?? '');
    const entries = await page.evaluate(() => history.length);
    await page.locator(ARTIST_LINKS).first().click();
    await page.locator(HEADING).waitFor();
    expect(await page.evaluate(() => history.length)).toBe(entries + 1);
    expect(search(page)).toBe(href);
    await expect(page.locator(INPUT)).toHaveValue('eagl');
    expect(await page.locator(ARTIST_ROWS).count()).toBe(expected.count);
    expect(await page.locator('main h2').allTextContents()).toEqual([expected.name]);
    expect(await page.locator(HEADING + ' h2').textContent()).toBe(expected.name);
    expect(await page.locator(HEADING + ' p').textContent()).toBe(countText(expected.count));
    await expect(page.getByText('Showing the top 50')).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    // focus is on the heading block, whose name carries "<name>, N songs"
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(artistLabel(expected));
    expect(await page.evaluate(() => document.querySelectorAll('[role="status"]').length)).toBe(1);
    // A tap moves focus to the heading, so the live region stays silent (announcing the same text twice is what QA flagged):
    // give it longer than the 600 ms settle delay to prove it.
    await page.waitForTimeout(800);
    expect(await page.locator(STATUS).textContent()).toBe('');

    await page.goBack();
    await page.locator(ARTIST_LINKS).first().waitFor();
    expect(search(page)).toBe('?q=eagl');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('search-input');
    await page.goForward();
    await page.locator(HEADING).waitFor();
    await page.getByRole('button', { name: 'Back to results' }).click();
    await page.locator(ARTIST_LINKS).first().waitFor();
    expect(search(page)).toBe('?q=eagl');
    expect(await page.evaluate(() => history.length)).toBe(entries + 1); // the chevron goes Back; it adds no entries
  });

  test.describe('on a short screen', () => {
    test.use({ viewport: { width: 390, height: 600 } });
    test('Back puts the results where they were scrolled', async ({ page }) => {
      await openApp(page, '/?q=queen');
      await page.locator(ARTIST_LINKS).first().waitFor();
      await page.locator(ROWS).nth(9).waitFor();
      await page.evaluate(() => window.scrollTo(0, 130));
      expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(130);
      await page.locator(ARTIST_LINKS).first().evaluate((a) => (a as HTMLAnchorElement).click()); // under the sticky box at this scroll
      await page.locator(HEADING).waitFor();
      await page.evaluate(() => window.scrollTo(0, 900));
      await page.goBack();
      await page.locator(ARTIST_LINKS).first().waitFor();
      await page.waitForFunction(() => Math.round(window.scrollY) === 130);
      // and focus is back in the box, not lost
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('search-input');
    });
  });

  test('editing the box in the artist view leaves it (replace, no new entry); clearing goes home', async ({ page }) => {
    await openApp(page, '/?q=eagl');
    await page.locator(ARTIST_LINKS).first().click();
    await page.locator(HEADING).waitFor();
    const entries = await page.evaluate(() => history.length);
    await page.locator(INPUT).click();
    await page.keyboard.press('End');
    await page.keyboard.type('e', { delay: 30 });
    await page.locator(HEADING).waitFor({ state: 'detached' });
    expect(search(page)).toBe('?q=eagle');
    expect(await page.evaluate(() => history.length)).toBe(entries);
    await page.locator(ARTIST_LINKS).first().click();
    await page.locator(HEADING).waitFor();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await page.getByText('Find your song number').waitFor();
    expect(search(page)).toBe('');
  });

  test('a ctrl-click on an artist opens it in a new tab (the app does not take it over)', async ({ page, context }) => {
    await openApp(page, '/?q=eagl');
    await page.locator(ARTIST_LINKS).first().waitFor();
    const [tab] = await Promise.all([context.waitForEvent('page'), page.locator(ARTIST_LINKS).first().click({ modifiers: ['Control'] })]);
    await tab.waitForURL(/artist=/);
    expect(new URL(tab.url()).search).toMatch(/^\?q=eagl&artist=/);
    expect(search(page)).toBe('?q=eagl');
    await expect(page.locator(HEADING)).toHaveCount(0);
    await tab.close();
  });
});

test.describe('deep links', () => {
  test('?q=eagl&artist=eagles opens the view; its chevron stays in the app; the dotted id b.o.b works and its link keeps the dot', async ({ page, baseURL, problems }) => {
    const eagles = artistFact('eagles');
    await page.goto('/?q=eagl&artist=eagles');
    await page.locator(HEADING).waitFor();
    expect(await page.locator(HEADING + ' h2').textContent()).toBe(eagles.name);
    expect(await page.locator(ARTIST_ROWS).count()).toBe(eagles.count);
    await expect(page.locator(INPUT)).toHaveValue('eagl');
    const entries = await page.evaluate(() => history.length);
    await page.getByRole('button', { name: 'Back to results' }).click();
    await page.locator(ARTIST_LINKS).first().waitFor();
    expect(search(page)).toBe('?q=eagl');
    expect(await page.evaluate(() => history.length)).toBe(entries); // direct load: the chevron replaces the URL, it does not leave the app
    expect(new URL(page.url()).origin).toBe(baseURL);

    const bob = artistFact('b.o.b');
    await page.goto('/?q=bob&artist=b.o.b');
    await page.locator(HEADING).waitFor();
    expect(await page.locator(HEADING + ' h2').textContent()).toBe(bob.name);
    expect(await page.locator(ARTIST_ROWS).count()).toBe(bob.count);
    expect(await page.locator(HEADING + ' p').textContent()).toBe(countText(bob.count));
    await page.goto('/?q=b.o.b');
    await page.locator(ARTIST_LINKS).first().waitFor();
    const links = await page.locator(ARTIST_LINKS).evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
    expect(links.some((h) => h.endsWith('artist=b.o.b'))).toBe(true);
    expect(problems).toEqual([]);
  });

  for (const id of ['nobody-at-all', '%E0%A4%A', '%', '..', '%3Cscript%3E', 'a'.repeat(300)]) {
    test(`an unknown or malformed artist id (${id.length > 20 ? `${id.length} letters` : id}) shows the normal results and is dropped from the URL`, async ({ page, problems }) => {
      await page.goto(`/?q=eagl&artist=${id}`);
      await page.locator(ARTIST_LINKS).first().waitFor();
      await expect(page.locator(HEADING)).toHaveCount(0);
      await page.waitForFunction(() => !location.search.includes('artist='));
      expect(search(page)).toBe('?q=eagl');
      expect(problems).toEqual([]);
    });
  }

  test('an empty artist id is no artist; an unknown id without a query is the home state with a clean URL', async ({ page, problems }) => {
    await page.goto('/?q=eagl&artist=');
    await page.locator(ARTIST_LINKS).first().waitFor();
    await expect(page.locator(HEADING)).toHaveCount(0);
    await page.goto('/?artist=nobody-at-all');
    await page.getByText('Find your song number').waitFor();
    await page.waitForFunction(() => location.search === '');
    expect(problems).toEqual([]);
  });
});
