/**
 * Smoke test for T005/T006, against the BUILT site (run `npm run build` first): the dataset loads in the worker,
 * the page is ready to type, the query is mirrored to ?q=, the dataset loads in the worker (each file's bytes once),
 * typing is not blocked while it loads, the theme toggle works, and a failed load shows the retry message and recovers.
 * T007: real results (a known song number, the empty state, 50 rows + the hint row), no console errors, and the
 * keystroke cost of a large result set at 4x CPU. Not part of `npm run qa` yet (T009 owns the e2e suite).
 *
 *   npm run e2e:smoke
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { startServer } from '../../scripts/serve-out.mjs';

const ERROR_TEXT = "Couldn't load the song book. Check your connection and try again.";
const LONG_TASK_LIMIT_MS = 250; // a hydration task on a laptop is ~50-100 ms; the 47k-song index build would be 300+ ms
const INPUT_EVENT_LIMIT_MS = 100;

const server = await startServer({ port: 0, dir: 'out' });
const base = `http://127.0.0.1:${server.port}`;
// What the server really sent. (The browser reports a revalidated 304 as a 200, so the browser's own log cannot tell them apart.)
const served = [];
server.server.on('request', (req, res) => {
  if (req.url?.startsWith('/data/')) res.on('finish', () => served.push(`${req.url.split('/').pop()} ${res.statusCode}`));
});
const browser = await chromium.launch();
let failed = false;

async function open(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await page.addInitScript(() => {
    const m = (window.__m = { longtasks: [], events: [], ready: null });
    const Orig = window.Worker;
    window.Worker = class extends Orig {
      constructor(...a) {
        super(...a);
        this.addEventListener('message', (e) => {
          if (e.data && e.data.type === 'ready') m.ready = performance.now();
        });
      }
    };
    new PerformanceObserver((l) => l.getEntries().forEach((e) => m.longtasks.push({ start: e.startTime, dur: e.duration }))).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => m.events.push({ name: e.name, start: e.startTime, dur: e.duration }))).observe({ type: 'event', durationThreshold: 16, buffered: true });
  });
  return page;
}

async function step(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${name}\n     ${error instanceof Error ? error.message : error}`);
  }
}

const INPUT = '#search-input';
const hydrated = (page) => page.waitForFunction(() => Object.keys(document.querySelector('#search-input')).some((k) => k.startsWith('__reactProps')));

await step('the page opens ready to type; typing is mirrored to ?q=; the data is downloaded once; the main thread is never blocked', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await open(context);
  served.length = 0;
  await page.goto(base + '/');
  const input = page.locator(INPUT);
  await input.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'search-input', 'the box is focused on load (autofocus)');
  await hydrated(page);
  await page.keyboard.type('hotel californa', { delay: 40 });
  assert.equal(new URL(page.url()).search, '?q=hotel+californa');
  await page.waitForFunction(() => window.__m.ready !== null);
  await page.waitForFunction(() => !document.querySelector('[role="status"]')?.textContent?.includes('Loading'));
  const responses = [...served];
  const bodies = responses.filter((r) => r.endsWith(' 200')).map((r) => r.split(' ')[0]).sort();
  assert.deepEqual(bodies, ['artists.json', 'songs.json'], `each file's bytes are sent once (server responses: ${responses.join(', ')})`);
  assert.ok(responses.every((r) => r.endsWith(' 200') || r.endsWith(' 304')), 'only 200 and 304 responses');

  const m = await page.evaluate(() => window.__m);
  const worst = Math.max(0, ...m.longtasks.map((t) => t.dur));
  assert.ok(worst < LONG_TASK_LIMIT_MS, `longest main-thread task ${worst.toFixed(0)} ms (limit ${LONG_TASK_LIMIT_MS})`);
  const typing = m.events.filter((e) => ['keydown', 'keypress', 'input', 'keyup'].includes(e.name)).map((e) => e.dur);
  const slowest = Math.max(0, ...typing);
  assert.ok(slowest < INPUT_EVENT_LIMIT_MS, `slowest key/input event ${slowest.toFixed(0)} ms (limit ${INPUT_EVENT_LIMIT_MS})`);
  console.log(`     ${responses.join(', ')}; longest task ${worst.toFixed(0)} ms, slowest key/input event ${slowest.toFixed(0)} ms`);
  await page.getByRole('button', { name: 'Clear search' }).click();
  assert.equal(new URL(page.url()).search, '', 'clearing removes ?q');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'search-input', 'clearing keeps focus');
  await context.close();
});

await step('a reload brings the query back from the URL', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await open(context);
  await page.goto(base + '/?q=eagles');
  await page.waitForFunction(() => document.querySelector('#search-input')?.value === 'eagles');
  assert.equal(await page.getByText('Find your song number').count(), 0, 'the home copy is gone when there is a query');
  await context.close();
});

await step('the theme toggle switches dark to light for the session and nothing is stored', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
  const page = await open(context);
  await page.goto(base + '/');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'dark by default even when the system is light');
  await hydrated(page);
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  await page.getByRole('button', { name: 'Switch to dark theme' }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.length + document.cookie.length), 0);
  await page.reload();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'not persisted: a reload is dark again');
  await context.close();
});

await step('a failed load shows the retry message, and Try again recovers', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await open(context);
  let blocked = true;
  await page.route('**/data/songs.json', (route) => (blocked ? route.abort('connectionfailed') : route.continue()));
  await page.goto(base + '/');
  await hydrated(page);
  await page.locator(INPUT).fill('hotel');
  const alertBox = page.locator('main [role="alert"]'); // Next.js adds its own empty route announcer with role=alert
  await alertBox.waitFor();
  assert.equal((await alertBox.locator('p').textContent())?.trim(), ERROR_TEXT);
  blocked = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.waitForFunction(() => window.__m.ready !== null);
  await alertBox.waitFor({ state: 'detached' });
  assert.equal(await page.locator(INPUT).inputValue(), 'hotel', 'the typed text is kept');
  await context.close();
});

await step('the loading line shows only when the guest typed before the data was ready', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await open(context);
  await page.route('**/data/artists.json', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.goto(base + '/');
  const status = page.locator('main [role="status"]');
  await page.locator(INPUT).waitFor();
  assert.equal(((await status.textContent()) ?? '').trim(), '', 'nothing is shown before the guest types');
  await hydrated(page);
  await page.locator(INPUT).pressSequentially('hot', { delay: 30 });
  await page.waitForFunction(() => document.querySelector('main [role="status"]')?.textContent?.includes('Loading song book…'));
  await page.waitForFunction(() => window.__m.ready !== null);
  await page.waitForFunction(() => !document.querySelector('main [role="status"]')?.textContent?.includes('Loading'));
  await context.close();
});

// The song number of "Hotel California" by Eagles, from the dataset itself (columnar: n, t, a).
const songs = JSON.parse(readFileSync(new URL('../../public/data/songs.json', import.meta.url), 'utf8'));
const hotelIndex = songs.t.findIndex((title, i) => title === 'Hotel California' && songs.a[i] === 'Eagles');
assert.ok(hotelIndex >= 0, 'the dataset has Hotel California by Eagles');
const HOTEL_NUMBER = songs.n[hotelIndex];

await step('results: a typo finds the right number; no matches shows the empty state; a broad query shows 50 rows and the hint; no console errors', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await open(context);
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(base + '/');
  await hydrated(page);
  const input = page.locator(INPUT);
  const rows = page.locator('main ul[aria-label="Song results"] > li');
  const hint = page.getByText('Showing the top 50 matches. Keep typing to narrow down.');
  const empty = page.getByRole('heading', { name: 'No songs found' });

  await input.pressSequentially('hotel californa', { delay: 30 });
  await page.getByText(String(HOTEL_NUMBER), { exact: true }).waitFor();
  const row = rows.filter({ hasText: `Song ${HOTEL_NUMBER}, Hotel California by Eagles` });
  assert.equal(await row.count(), 1, `a row for song ${HOTEL_NUMBER}, Hotel California by Eagles`);
  assert.equal(await row.evaluate((li) => li.getBoundingClientRect().height), 88, 'the row is 88px tall');
  assert.equal(await empty.count(), 0);

  await input.fill('xyzqq');
  await empty.waitFor();
  assert.equal(await rows.count(), 0, 'no rows with the empty state');
  assert.ok((await page.locator('main').textContent())?.includes('Nothing matches "xyzqq".'));

  await input.fill('love');
  await hint.waitFor();
  assert.equal(await rows.count(), 50, '50 rows for a broad query');
  assert.equal(await empty.count(), 0);
  assert.equal(await hint.evaluate((el) => el.getBoundingClientRect().height), 64, 'the hint row is 64px');
  await page.waitForFunction(() => /songs found$/.test(document.querySelector('main [role="status"]')?.textContent ?? ''));

  await input.fill('!!!');
  await page.getByText('Find your song number').waitFor();
  assert.equal(await empty.count(), 0, 'punctuation-only input is the home state, not "No songs found"');
  assert.deepEqual(problems, [], 'no console errors');
  await context.close();
});

const ROWS = 'main ul[aria-label="Song results"] > li';

await step('row and empty-state metrics at normal text size: 88px rows, 136px number, 17px title, 2px gap, 64px below the field', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await open(context);
  await page.goto(base + '/?q=love');
  await page.locator(ROWS).nth(49).waitFor();
  const m = await page.evaluate((ROWS) => {
    const li = document.querySelector(ROWS);
    const [, num, text] = li.children;
    const [title, artist] = text.children;
    const r = (el) => el.getBoundingClientRect();
    const cs = (el) => getComputedStyle(el);
    return {
      heights: [...document.querySelectorAll(ROWS)].map((row) => r(row).height),
      minHeight: cs(li).minHeight,
      numberWidth: r(num).width,
      numberMinWidth: cs(num).minWidth,
      numberFont: [cs(num).fontSize, cs(num).lineHeight, cs(num).fontWeight],
      titleFont: [cs(title).fontSize, cs(title).lineHeight, cs(title).fontWeight],
      artistFont: [cs(artist).fontSize, cs(artist).lineHeight, cs(artist).fontWeight],
      gap: r(artist).top - r(title).bottom,
      textLeft: r(text).left - r(li).left,
    };
  }, ROWS);
  assert.ok(m.heights.every((h) => h === 88), `every row is exactly 88px (got ${[...new Set(m.heights)]})`);
  assert.equal(m.minHeight, '88px');
  assert.equal(m.numberWidth, 136, 'the number column is exactly 136px at normal size');
  assert.equal(m.numberMinWidth, '136px');
  assert.deepEqual(m.numberFont, ['36px', '40px', '800']);
  assert.deepEqual(m.titleFont, ['17px', '22px', '600'], 'title is 17/22 600');
  assert.deepEqual(m.artistFont, ['14px', '20px', '400']);
  assert.equal(m.gap, 2, '2px between title and artist');
  assert.equal(m.textLeft, 164, 'text starts 16 + 136 + 12 px in');

  await page.locator(INPUT).fill('xyzqq');
  await page.getByRole('heading', { name: 'No songs found' }).waitFor();
  const below = await page.evaluate(() => {
    const field = document.querySelector('#search-input').parentElement.getBoundingClientRect();
    const icon = document.querySelector('#no-results-title').parentElement.querySelector('svg').getBoundingClientRect();
    return icon.top - field.bottom;
  });
  assert.equal(below, 64, 'the empty state starts 64px below the search field');
  await context.close();
});

await step('a new query scrolls the results back to the top', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 600 } });
  const page = await open(context);
  await page.goto(base + '/?q=love');
  await page.locator(ROWS).nth(49).waitFor();
  await page.evaluate(() => window.scrollTo(0, 1500));
  assert.ok((await page.evaluate(() => window.scrollY)) > 1000, 'scrolled down the list');
  await page.locator(INPUT).fill('lover');
  await page.waitForFunction(() => window.scrollY === 0);
  await context.close();
});

await step('the empty-state echo of a 200-letter word ends in an ellipsis directly followed by the quote and period (320px)', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const page = await open(context);
  await page.goto(base + '/?q=' + 'q'.repeat(200));
  await page.getByRole('heading', { name: 'No songs found' }).waitFor();
  await page.waitForTimeout(300); // the web font may change the measured width once
  const m = await page.evaluate(() => {
    const line = document.querySelector('#no-results-title').nextElementSibling;
    const range = document.createRange();
    range.selectNodeContents(line);
    return { text: line.textContent, inner: line.clientWidth, scroll: line.scrollWidth, drawn: range.getBoundingClientRect().width };
  });
  assert.match(m.text, /^Nothing matches "q+…"\.$/, `the ellipsis is followed by the quote and period (${m.text})`);
  assert.ok(m.scroll <= m.inner, `the line is not clipped (${m.scroll} > ${m.inner})`);
  assert.ok(m.inner - m.drawn < 12, `no slack at the end of the line: ${(m.inner - m.drawn).toFixed(1)}px free (a letter is about 9px)`);
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert.ok(sw <= cw, 'no horizontal scroll');
  await context.close();
});

for (const [scale, width] of [[1.5, 390], [2, 390], [1.5, 320], [2, 320]]) {
  await step(`enlarged text x${scale} at ${width}px: the number never overlaps the title, rows grow instead of clipping, no horizontal scroll`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await open(context);
    await page.goto(base + '/?q=love');
    await page.locator(ROWS).nth(49).waitFor();
    // Stand-in for Android font scale / browser text zoom: scale every row font size and line height.
    await page.addStyleTag({
      content: `${ROWS} > span:nth-child(2){font-size:${36 * scale}px!important;line-height:${40 * scale}px!important}
        ${ROWS} > span:nth-child(3) > span:nth-child(1){font-size:${17 * scale}px!important;line-height:${22 * scale}px!important}
        ${ROWS} > span:nth-child(3) > span:nth-child(2){font-size:${14 * scale}px!important;line-height:${20 * scale}px!important}`,
    });
    const m = await page.evaluate((ROWS) => {
      let overlap = 0;
      let outside = 0;
      let narrowest = 1e9;
      for (const li of document.querySelectorAll(ROWS)) {
        const [, num, text] = li.children;
        const range = document.createRange();
        range.selectNodeContents(num);
        const digits = range.getBoundingClientRect();
        const t = text.getBoundingClientRect();
        const l = li.getBoundingClientRect();
        if (digits.right > t.left + 0.01 || num.getBoundingClientRect().right > t.left + 0.01) overlap++;
        if (t.bottom > l.bottom + 0.5 || digits.bottom > l.bottom + 0.5 || t.right > l.right + 0.5) outside++;
        narrowest = Math.min(narrowest, t.width);
      }
      const de = document.documentElement;
      return { overlap, outside, narrowest, wide: de.scrollWidth > de.clientWidth };
    }, ROWS);
    assert.equal(m.overlap, 0, 'no number draws over its title');
    assert.equal(m.outside, 0, 'row content stays inside its row');
    assert.equal(m.wide, false, 'no horizontal scroll');
    await context.close();
  });
}

await step('keystroke cost with a large result set (love, 4x CPU slowdown) stays under 100 ms', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await open(context);
  await page.goto(base + '/');
  await hydrated(page);
  await page.waitForFunction(() => window.__m.ready !== null);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const input = page.locator(INPUT);
  const rows = page.locator('main ul[aria-label="Song results"] > li');
  await input.pressSequentially('love', { delay: 250 });
  await rows.first().waitFor();
  await page.waitForFunction(() => document.querySelectorAll('main ul[aria-label="Song results"] > li').length === 50);
  // Keystroke to paint: time from each key event until the next frame after it has been drawn.
  const per = await page.evaluate(async () => {
    const field = document.querySelector('#search-input');
    const out = [];
    for (const text of ['lov', 'love', 'lover', 'love']) {
      const t0 = performance.now();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(field, text);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      out.push(performance.now() - t0);
      await new Promise((r) => setTimeout(r, 600));
    }
    return out;
  });
  const m = await page.evaluate(() => window.__m);
  const typing = m.events.filter((e) => ['keydown', 'keypress', 'input', 'keyup'].includes(e.name)).map((e) => e.dur);
  const slowest = Math.max(0, ...typing, ...per);
  console.log(`     4x CPU: slowest key/input event ${Math.max(0, ...typing).toFixed(0)} ms, keystroke-to-next-paint ${per.map((x) => x.toFixed(0)).join('/')} ms`);
  assert.ok(slowest < 100, `slowest keystroke ${slowest.toFixed(0)} ms (limit 100)`);
  await context.close();
});

for (const width of [320, 360, 390, 430]) {
  await step(`no horizontal scroll at ${width}px`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await open(context);
    await page.goto(base + '/?q=' + 'a'.repeat(60));
    await page.locator(INPUT).waitFor();
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(sw <= cw, `scrollWidth ${sw} > clientWidth ${cw}`);
    await context.close();
  });
}

await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
