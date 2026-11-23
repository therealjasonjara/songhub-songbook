import type { Page } from '@playwright/test';
import { ARTIST_LINKS, ARTIST_ROWS, HEADING, HINT_TEXT, INPUT, ROWS, STATUS, openApp, waitHydrated } from './app';

/** The screens every accessibility / contrast / target-size check runs on. */
export const STATES = ['home', 'results with artists', 'hint row', 'empty state', 'artist view (568 songs)', 'error state', 'loading state'] as const;
export type StateName = (typeof STATES)[number];

/**
 * Puts the page into a state and waits until it is fully drawn. Returns a function to call when the test is done
 * (the loading state holds the dataset back until released).
 */
export async function prepareState(page: Page, state: StateName): Promise<() => void> {
  // a page can be taken through several states: routes set for an earlier one (a blocked dataset) must not leak into the next
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  switch (state) {
    case 'home':
      await openApp(page);
      break;
    case 'results with artists':
      await openApp(page, '/?q=eagl');
      await page.locator(ARTIST_LINKS).first().waitFor();
      await page.locator(ROWS).first().waitFor();
      break;
    case 'hint row':
      await openApp(page, '/?q=love');
      await page.getByText(HINT_TEXT).waitFor();
      await page.locator(ROWS).nth(49).waitFor();
      break;
    case 'empty state':
      await openApp(page, '/?q=xyzqq');
      await page.getByRole('heading', { name: 'No songs found' }).waitFor();
      break;
    case 'artist view (568 songs)':
      await openApp(page, '/?q=unknown&artist=unknown');
      await page.locator(HEADING).waitFor();
      await page.locator(ARTIST_ROWS).nth(567).waitFor({ state: 'attached' });
      break;
    case 'error state':
      await page.route('**/data/songs.json', (route) => route.abort('connectionfailed'));
      await page.goto('/');
      await waitHydrated(page);
      await page.locator(INPUT).fill('hotel');
      await page.locator('main [role="alert"]').waitFor();
      break;
    case 'loading state': {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => (release = resolve));
      await page.route('**/data/artists.json', async (route) => {
        await gate;
        await route.continue().catch(() => {});
      });
      await page.goto('/');
      await waitHydrated(page);
      await page.locator(INPUT).pressSequentially('hot', { delay: 20 });
      await page.locator(STATUS).filter({ hasText: 'Loading song book…' }).waitFor();
      return release;
    }
  }
  return () => {};
}
