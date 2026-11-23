import { INPUT, ROWS, openApp, search } from './support/app';
import { expect, test } from './support/test';

// Smoke steps ported: 2 (a reload brings the query back), 3 (theme toggle, nothing stored).

test.describe('query in the URL', () => {
  test('a reload with ?q= puts the text back in the box and shows its results', async ({ page }) => {
    await page.goto('/?q=eagles');
    await page.waitForFunction(() => (document.querySelector('#search-input') as HTMLInputElement | null)?.value === 'eagles');
    await expect(page.getByText('Find your song number')).toHaveCount(0);
    await page.locator(ROWS).first().waitFor();
    await page.reload();
    await expect(page.locator(INPUT)).toHaveValue('eagles');
    await page.locator(ROWS).first().waitFor();
    expect(search(page)).toBe('?q=eagles');
  });

  test('a query with spaces and punctuation round-trips through the address bar', async ({ page }) => {
    await openApp(page);
    await page.locator(INPUT).fill("don't stop & go");
    await page.waitForFunction(() => location.search !== '');
    const url = search(page);
    await page.goto('/' + url);
    await expect(page.locator(INPUT)).toHaveValue("don't stop & go");
  });
});

test.describe('theme', () => {
  test.use({ colorScheme: 'light' });

  test('dark by default even when the system prefers light; the toggle switches to light; nothing is stored; a reload is dark again', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: light)').matches)).toBe(true);
    await page.waitForFunction(() => Object.keys(document.querySelector('#search-input') as Element).some((k) => k.startsWith('__reactProps')));
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
    await page.getByRole('button', { name: 'Switch to dark theme' }).waitFor();
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length + document.cookie.length)).toBe(0);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(250, 248, 245)');
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  });

  test('the toggle round-trips light and back to dark', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(14, 15, 20)');
  });
});
