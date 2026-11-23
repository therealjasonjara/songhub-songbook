/**
 * Large-text check for the song row (T007, A-011). Not part of `npm run qa`.
 *
 *   npm run build && node scripts/measure-large-text.mjs [label]
 *
 * Serves the built `out/`, searches, and for each text scale multiplies every row font size AND line height
 * (number, title, artist, hint) through an injected stylesheet. This stands in for Android font scale / browser
 * text zoom, which `--force-device-scale-factor` and media emulation do not reproduce. For each scale and width it
 * checks, over all rows: the number box never overlaps the text box, the number is not clipped, the row contains
 * its content, and the page has no horizontal overflow. Prints the default-scale spec table and one line per scale.
 * Exits 1 on any violation. Writes docs/design/built/12-large-text-<label>-dark.png (1.5x, 390 px).
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { startServer } from './serve-out.mjs';

const label = process.argv[2] ?? 'after';
const SCALES = [1, 1.15, 1.3, 1.5, 2];
const WIDTHS = [320, 390];
const QUERIES = ['love', 'night'];

const ROW = 'main ul[aria-label="Song results"] > li';
const css = (f) => `
${ROW} > span:nth-child(2) { font-size: ${36 * f}px !important; line-height: ${40 * f}px !important; }
${ROW} > span:nth-child(3) > span:nth-child(1) { font-size: ${17 * f}px !important; line-height: ${22 * f}px !important; }
${ROW} > span:nth-child(3) > span:nth-child(2) { font-size: ${14 * f}px !important; line-height: ${20 * f}px !important; }
main ul[aria-label="Song results"] + p { font-size: ${14 * f}px !important; line-height: ${20 * f}px !important; }`;

const server = await startServer({ port: 0, dir: 'out' });
const browser = await chromium.launch();
let violations = 0;

async function measure(page) {
  return page.evaluate((ROW) => {
    const rows = [...document.querySelectorAll(ROW)];
    const out = { rows: rows.length, fiveDigit: 0, heights: new Set(), numWidths: new Set(), overlap: 0, clipped: 0, escapes: 0, spill: 0, maxNum: 0, minText: 1e9 };
    for (const li of rows) {
      const num = li.children[1];
      const text = li.children[2];
      const l = li.getBoundingClientRect();
      const n = num.getBoundingClientRect();
      const t = text.getBoundingClientRect();
      if (num.textContent.length >= 5) out.fiveDigit++;
      out.heights.add(l.height);
      out.numWidths.add(n.width);
      out.maxNum = Math.max(out.maxNum, n.width);
      out.minText = Math.min(out.minText, t.width);
      // the digits themselves (not just the box) must end before the text starts
      const range = document.createRange();
      range.selectNodeContents(num);
      const digits = range.getBoundingClientRect();
      if (n.right > t.left + 0.01 || digits.right > t.left + 0.01) out.overlap++;
      // clipped: the digits' own width exceeds the box
      if (digits.right > n.right + 0.5 || num.scrollWidth > num.clientWidth) out.clipped++;
      if (t.right > l.right + 0.5 || n.left < l.left - 0.5) out.escapes++;
      // content must stay inside the row's own box vertically
      for (const el of [num, text]) {
        const r = el.getBoundingClientRect();
        if (r.top < l.top - 0.5 || r.bottom > l.bottom + 0.5) out.spill++;
      }
      // the title/artist block must not overflow its own box (clamp + ellipsis hold)
      if (text.scrollWidth > text.clientWidth + 0.5) out.escapes++;
    }
    const de = document.documentElement;
    return { ...out, heights: [...out.heights], numWidths: [...out.numWidths], hOverflow: de.scrollWidth > de.clientWidth };
  }, ROW);
}

async function specTable(page) {
  return page.evaluate((ROW) => {
    const li = document.querySelector(ROW);
    const num = li.children[1];
    const text = li.children[2];
    const title = text.children[0];
    const artist = text.children[1];
    const cs = (el, ...p) => Object.fromEntries(p.map((k) => [k, getComputedStyle(el)[k]]));
    const r = (el) => el.getBoundingClientRect();
    return {
      row: { ...cs(li, 'height', 'minHeight', 'paddingLeft', 'paddingRight', 'columnGap', 'borderBottomWidth', 'borderBottomColor'), h: r(li).height },
      number: { ...cs(num, 'fontSize', 'lineHeight', 'fontWeight', 'color', 'textAlign', 'fontVariantNumeric', 'whiteSpace'), w: r(num).width, x: r(num).left - r(li).left },
      textBlock: { x: r(text).left - r(li).left, gapFromNumber: r(text).left - r(num).right, w: r(text).width },
      title: { ...cs(title, 'fontSize', 'lineHeight', 'fontWeight', 'color'), clamp: getComputedStyle(title).webkitLineClamp },
      artist: { ...cs(artist, 'fontSize', 'lineHeight', 'fontWeight', 'color', 'textOverflow', 'whiteSpace'), gapFromTitle: r(artist).top - r(title).bottom },
      numberVsTextCentre: [(r(num).top + r(num).bottom) / 2 - (r(li).top + r(li).bottom) / 2, (r(text).top + r(text).bottom) / 2 - (r(li).top + r(li).bottom) / 2],
    };
  }, ROW);
}

try {
  mkdirSync('docs/design/built', { recursive: true });
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(`http://127.0.0.1:${server.port}/`);
    for (const q of QUERIES) {
      await page.locator('#search-input').fill(q);
      await page.waitForFunction((r) => document.querySelectorAll(r).length === 50, ROW);
      await page.waitForTimeout(300);
      if (width === 390 && q === QUERIES[0]) console.log('spec table @ 1x, 390:', JSON.stringify(await specTable(page), null, 1));
      for (const f of SCALES) {
        const handle = await page.addStyleTag({ content: css(f) });
        await page.waitForTimeout(50);
        const m = await measure(page);
        const bad = m.overlap + m.clipped + m.escapes + m.spill + (m.hOverflow ? 1 : 0) + (f === 1 && (m.heights.length !== 1 || m.heights[0] !== 88 || m.numWidths.length !== 1 || m.numWidths[0] !== 136) ? 1 : 0);
        if (bad) violations++;
        console.log(`${bad ? 'FAIL' : 'ok  '} ${width}px "${q}" x${f}: rows ${m.rows} (5-digit ${m.fiveDigit}), row heights ${m.heights.length > 3 ? `${Math.min(...m.heights)}-${Math.max(...m.heights)}` : m.heights.join('/')}, number col ${Math.min(...m.numWidths).toFixed(1)}-${m.maxNum.toFixed(1)}, narrowest text block ${m.minText.toFixed(1)}, overlap ${m.overlap}, clipped ${m.clipped}, escaped ${m.escapes}, spill ${m.spill}, h-overflow ${m.hOverflow}`);
        if (width === 390 && f === 1.5 && q === QUERIES[0]) {
          await page.evaluate(() => (document.scrollingElement.scrollTop = 0));
          await page.screenshot({ path: `docs/design/built/12-large-text-${label}-dark.png` });
        }
        await handle.evaluate((el) => el.remove());
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(violations ? `${violations} violation(s)` : 'no violations');
process.exit(violations ? 1 : 0);
