import { HINT_TEXT, INPUT, ROWS, STATUS, openApp, search, waitWorkerReady } from './support/app';
import { HOTEL_NUMBER } from './support/data';
import { expect, test } from './support/test';

// Smoke steps ported: 1 (ready to type, ?q= mirror, clear), 6 (typo, empty, 50 rows + hint, home for punctuation, no console errors), 8 (scroll to top).

test.describe('search', () => {
  test('the page opens with the box focused and typing is mirrored to ?q= (no history entries)', async ({ page }) => {
    await page.goto('/');
    await page.locator(INPUT).waitFor();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('search-input');
    await page.waitForFunction(() => Object.keys(document.querySelector('#search-input') as Element).some((k) => k.startsWith('__reactProps')));
    const entries = await page.evaluate(() => history.length);
    await page.keyboard.type('hotel californa', { delay: 40 });
    expect(search(page)).toBe('?q=hotel+californa');
    expect(await page.evaluate(() => history.length)).toBe(entries);
  });

  test('the clear button empties the box, removes ?q and keeps focus in the box', async ({ page }) => {
    await openApp(page);
    await page.keyboard.type('hotel californa', { delay: 20 });
    await waitWorkerReady(page);
    await page.getByRole('button', { name: 'Clear search' }).click();
    expect(search(page)).toBe('');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('search-input');
    await expect(page.locator(INPUT)).toHaveValue('');
    await expect(page.getByText('Find your song number')).toBeVisible();
  });

  test('a title with a typo finds the right song number (the row says number, title, artist)', async ({ page }) => {
    await openApp(page);
    await page.locator(INPUT).pressSequentially('hotel californa', { delay: 30 });
    await page.getByText(String(HOTEL_NUMBER), { exact: true }).waitFor();
    const row = page.locator(ROWS).filter({ hasText: `Song ${HOTEL_NUMBER}, Hotel California by Eagles` });
    await expect(row).toHaveCount(1);
    expect(await row.evaluate((li) => li.getBoundingClientRect().height)).toBe(88);
    await expect(page.getByRole('heading', { name: 'No songs found' })).toHaveCount(0);
  });

  test('no matches shows the empty state with the echoed query and no rows', async ({ page }) => {
    await openApp(page);
    await page.locator(INPUT).fill('xyzqq');
    await page.getByRole('heading', { name: 'No songs found' }).waitFor();
    await expect(page.locator(ROWS)).toHaveCount(0);
    expect(await page.locator('main').textContent()).toContain('Nothing matches "xyzqq".');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('search-input');
  });

  test('a broad query shows 50 rows and the hint row, and the result count is announced once settled', async ({ page }) => {
    await openApp(page);
    await page.locator(INPUT).fill('love');
    await page.getByText(HINT_TEXT).waitFor();
    await expect(page.locator(ROWS)).toHaveCount(50);
    await expect(page.getByRole('heading', { name: 'No songs found' })).toHaveCount(0);
    expect(await page.getByText(HINT_TEXT).evaluate((el) => el.getBoundingClientRect().height)).toBe(64);
    await page.waitForFunction((sel) => /songs found$/.test(document.querySelector(sel)?.textContent ?? ''), STATUS);
  });

  test('punctuation-only input is the home state, not "No songs found"', async ({ page }) => {
    await openApp(page);
    await page.locator(INPUT).fill('!!!');
    await page.getByText('Find your song number').waitFor();
    await expect(page.getByRole('heading', { name: 'No songs found' })).toHaveCount(0);
  });

  test('a whole search session (typo, empty, broad, punctuation) raises no console errors', async ({ page, problems }) => {
    await openApp(page);
    const input = page.locator(INPUT);
    await input.pressSequentially('hotel californa', { delay: 30 });
    await page.getByText(String(HOTEL_NUMBER), { exact: true }).waitFor();
    await input.fill('xyzqq');
    await page.getByRole('heading', { name: 'No songs found' }).waitFor();
    await input.fill('love');
    await page.getByText(HINT_TEXT).waitFor();
    await input.fill('!!!');
    await page.getByText('Find your song number').waitFor();
    expect(problems).toEqual([]);
  });

  test.describe('on a short screen', () => {
    test.use({ viewport: { width: 390, height: 600 } });
    test('a new query scrolls the results back to the top', async ({ page }) => {
      await openApp(page, '/?q=love');
      await page.locator(ROWS).nth(49).waitFor();
      await page.evaluate(() => window.scrollTo(0, 1500));
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
      await page.locator(INPUT).fill('lover');
      await page.waitForFunction(() => window.scrollY === 0);
    });
  });
});
