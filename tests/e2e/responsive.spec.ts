import { ARTIST_LINKS, ARTIST_ROWS, INPUT, ROWS, openApp, overflowsHorizontally } from './support/app';
import { expect, test } from './support/test';

// Phone widths (mobile project only). Smoke steps ported: 9 (200-letter echo at 320), 18 (no horizontal scroll at 320/360/390/430).

test.describe('at 320px', () => {
  test.use({ viewport: { width: 320, height: 700 } });
  test('the empty-state echo of a 200-letter word ends in an ellipsis directly followed by the quote and period', async ({ page }) => {
    await page.goto('/?q=' + 'q'.repeat(200));
    await page.getByRole('heading', { name: 'No songs found' }).waitFor();
    await page.evaluate(() => document.fonts.ready); // the web font may change the measured width once
    const read = () =>
      page.evaluate(() => {
        const line = (document.querySelector('#no-results-title') as HTMLElement).nextElementSibling as HTMLElement;
        const range = document.createRange();
        range.selectNodeContents(line);
        return { text: line.textContent ?? '', inner: line.clientWidth, scroll: line.scrollWidth, drawn: range.getBoundingClientRect().width };
      });
    await expect.poll(async () => (await read()).text).toMatch(/^Nothing matches "q+…"\.$/);
    const m = await read();
    expect(m.scroll, `the line is not clipped (${m.scroll} > ${m.inner})`).toBeLessThanOrEqual(m.inner);
    expect(m.inner - m.drawn, `no slack at the end of the line (a letter is about 9px)`).toBeLessThan(12);
    expect(await overflowsHorizontally(page)).toBe(false);
  });
});

for (const width of [320, 360, 390, 430]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });
    test(`no horizontal scroll with a 60-letter query, results, artists, the artist view and the empty state`, async ({ page }) => {
      await page.goto('/?q=' + 'a'.repeat(60));
      await page.locator(INPUT).waitFor();
      expect(await overflowsHorizontally(page), '60-letter query').toBe(false);
      await openApp(page, '/?q=love');
      await page.locator(ROWS).nth(49).waitFor();
      expect(await overflowsHorizontally(page), 'results + hint').toBe(false);
      await openApp(page, '/?q=eagl');
      await page.locator(ARTIST_LINKS).first().waitFor();
      expect(await overflowsHorizontally(page), 'artists + songs').toBe(false);
      await openApp(page, '/?q=eagl&artist=eagles');
      await page.locator(ARTIST_ROWS).first().waitFor();
      expect(await overflowsHorizontally(page), 'artist view').toBe(false);
      await openApp(page, '/?q=xyzqq');
      await page.getByRole('heading', { name: 'No songs found' }).waitFor();
      expect(await overflowsHorizontally(page), 'empty state').toBe(false);
    });
  });
}
