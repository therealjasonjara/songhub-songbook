import type { Page } from '@playwright/test';

export const INPUT = '#search-input';
export const ROWS = 'main ul[aria-label="Song results"] > li';
export const ARTIST_LINKS = 'main section[aria-label="Artists"] a';
export const ARTIST_ROWS = 'main ul[aria-label^="Songs by"] > li';
export const HEADING = 'main [role="group"][aria-label]';
export const STATUS = 'main [role="status"]';
export const ERROR_TEXT = "Couldn't load the song book. Check your connection and try again.";
export const HINT_TEXT = 'Showing the top 50 matches. Keep typing to narrow down.';

/** React has attached its props to the input: before that, typing is not wired to anything. */
export async function waitHydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const el = document.querySelector('#search-input');
    return el !== null && Object.keys(el).some((k) => k.startsWith('__reactProps'));
  });
}

/** Opens a path (default home), waits for the box and for hydration. */
export async function openApp(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await page.locator(INPUT).waitFor();
  await waitHydrated(page);
}

/** The search worker has finished loading and indexing the dataset. */
export async function waitWorkerReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__m.ready !== null);
}

export const search = (page: Page) => new URL(page.url()).search;

/** Horizontal overflow of the page: scrollWidth beyond clientWidth. */
export async function overflowsHorizontally(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

/** Stand-in for Android font scale / browser text zoom (same technique as scripts/measure-large-text.mjs): scale every row font size and line height. */
export function largeTextCss(scale: number): string {
  return `${ROWS} > span:nth-child(2){font-size:${36 * scale}px!important;line-height:${40 * scale}px!important}
    ${ROWS} > span:nth-child(3) > span:nth-child(1){font-size:${17 * scale}px!important;line-height:${22 * scale}px!important}
    ${ROWS} > span:nth-child(3) > span:nth-child(2){font-size:${14 * scale}px!important;line-height:${20 * scale}px!important}`;
}

/** Sets the theme through the real toggle (the app keeps no other way to change it). */
export async function setTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  const current = await page.evaluate(() => document.documentElement.dataset.theme);
  if (current === theme) return;
  await page.getByRole('button', { name: theme === 'light' ? 'Switch to light theme' : 'Switch to dark theme' }).click();
  await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme);
}
