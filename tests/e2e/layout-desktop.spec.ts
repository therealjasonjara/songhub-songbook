import { ROWS, openApp, overflowsHorizontally } from './support/app';
import { expect, test } from './support/test';

// Desktop project only (1280x800): the page is one centred 560px column.

test.describe('desktop column', () => {
  test('the page is one centred 560px column; header, strip and rows fill it; no horizontal scroll', async ({ page }) => {
    await openApp(page, '/?q=love');
    await page.locator(ROWS).nth(49).waitFor();
    const m = await page.evaluate(() => {
      const r = (el: Element) => el.getBoundingClientRect();
      const header = r(document.querySelector('header') as Element);
      const strip = r(document.querySelector('[role="search"]') as Element);
      const row = r(document.querySelector('main ul[aria-label="Song results"] > li') as Element);
      return { vw: document.documentElement.clientWidth, header: [header.left, header.width], strip: [strip.left, strip.width], row: [row.left, row.width] };
    });
    const left = (m.vw - 560) / 2;
    expect(m.header).toEqual([left, 560]);
    expect(m.strip).toEqual([left, 560]);
    expect(m.row).toEqual([left, 560]);
    expect(await overflowsHorizontally(page)).toBe(false);
  });
});
