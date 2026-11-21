import { ROWS, STATUS, largeTextCss, openApp, overflowsHorizontally } from './support/app';
import { expect, test } from './support/test';

// Smoke step 10 ported: enlarged text (the stand-in for Android font scale / browser text zoom) at 1.5x and 2x, on 390 and 320 px.

for (const [scale, width] of [
  [1.5, 390],
  [2, 390],
  [1.5, 320],
  [2, 320],
] as const) {
  test.describe(`enlarged text x${scale} at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });
    test('the number never overlaps the title, rows grow instead of clipping, no horizontal scroll', async ({ page }) => {
      await openApp(page, '/?q=love');
      await page.locator(ROWS).nth(49).waitFor();
      await page.addStyleTag({ content: largeTextCss(scale) });
      const m = await page.evaluate((ROWS) => {
        let overlap = 0;
        let outside = 0;
        let clipped = 0;
        let narrowest = 1e9;
        let tallest = 0;
        for (const li of document.querySelectorAll(ROWS)) {
          const [, num, text] = [...li.children] as HTMLElement[];
          const range = document.createRange();
          range.selectNodeContents(num as Element);
          const digits = range.getBoundingClientRect();
          const t = (text as Element).getBoundingClientRect();
          const n = (num as Element).getBoundingClientRect();
          const l = li.getBoundingClientRect();
          if (digits.right > t.left + 0.01 || n.right > t.left + 0.01) overlap++;
          if (t.bottom > l.bottom + 0.5 || digits.bottom > l.bottom + 0.5 || t.right > l.right + 0.5) outside++;
          if (digits.right > n.right + 0.5 || (num as HTMLElement).scrollWidth > (num as HTMLElement).clientWidth) clipped++;
          narrowest = Math.min(narrowest, t.width);
          tallest = Math.max(tallest, l.height);
        }
        return { overlap, outside, clipped, narrowest, tallest, rows: document.querySelectorAll(ROWS).length };
      }, ROWS);
      expect(m.rows).toBe(50);
      expect(m.overlap, 'no number draws over its title').toBe(0);
      expect(m.outside, 'row content stays inside its row').toBe(0);
      expect(m.clipped, 'no number is clipped').toBe(0);
      expect(m.tallest, 'rows grow past 88px').toBeGreaterThan(88);
      expect(await overflowsHorizontally(page), 'no horizontal scroll').toBe(false);
    });
  });
}

test.describe('enlarged text on the other screens', () => {
  test.use({ viewport: { width: 320, height: 700 } });
  test('the header, the field and the artist heading do not overflow when the root font is enlarged', async ({ page }) => {
    // browser text zoom changes the root size; the layout uses px, so this checks the wrap/grow rules (A-010) with a 2x header and heading text
    await openApp(page, '/?q=eagl&artist=eagles');
    await page.addStyleTag({
      content: 'header h1{font-size:40px!important;line-height:48px!important} main [role="group"] h2{font-size:48px!important;line-height:60px!important} main [role="group"] p{font-size:28px!important;line-height:40px!important}',
    });
    await page.locator('main [role="group"]').waitFor();
    const m = await page.evaluate(() => {
      const r = (el: Element) => el.getBoundingClientRect();
      const toggle = r(document.querySelector('header button') as Element);
      const h1 = r(document.querySelector('header h1') as Element);
      const group = document.querySelector('main [role="group"]') as HTMLElement;
      const g = r(group);
      const name = r(group.querySelector('h2') as Element);
      const back = r(group.querySelector('button') as Element);
      return { headerGap: toggle.left - h1.right, headingHeight: g.height, nameBelowBackOrBeside: name.left >= back.right, inside: name.right <= g.right + 0.5 };
    });
    expect(m.headerGap, 'the wordmark does not run into the toggle').toBeGreaterThanOrEqual(0);
    expect(m.headingHeight, 'the heading block grows past 80px').toBeGreaterThan(80);
    expect(m.nameBelowBackOrBeside).toBe(true);
    expect(m.inside).toBe(true);
    expect(await overflowsHorizontally(page)).toBe(false);
    expect(await page.locator(STATUS).count()).toBe(1);
  });
});
