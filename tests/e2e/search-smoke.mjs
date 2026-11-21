/**
 * Smoke test for T005/T006, against the BUILT site (run `npm run build` first): the dataset loads in the worker,
 * the page is ready to type, the query is mirrored to ?q=, the dataset loads in the worker (each file's bytes once),
 * typing is not blocked while it loads, the theme toggle works, and a failed load shows the retry message and recovers.
 * T007: real results (a known song number, the empty state, 50 rows + the hint row), no console errors, and the
 * keystroke cost of a large result set at 4x CPU. T008: artist rows above the songs, the artist view (heading, count,
 * full list), Back (button and browser) with the scroll restored, deep links (dotted id, unknown id), and the
 * 568-row list at 4x CPU. Not part of `npm run qa` yet (T009 owns the e2e suite).
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


// ---- T008: artists --------------------------------------------------------------------------------------------
const artistData = JSON.parse(readFileSync(new URL('../../public/data/artists.json', import.meta.url), 'utf8'));
/** id -> { name, count } from the dataset itself ([id, name, aliases, count] per artist). */
const artistById = new Map(artistData.artists.map(([id, name, , count]) => [id, { name, count }]));
const ARTIST_LINKS = 'main section[aria-label="Artists"] a';
const ARTIST_ROWS = 'main ul[aria-label^="Songs by"] > li';
const HEADING = 'main [role="group"][aria-label]';
const idOf = (href) => new URL(href, 'http://x/').searchParams.get('artist');
const countText = (n) => (n === 1 ? '1 song' : `${n.toLocaleString('en-US')} songs`);

await step('typing eagl shows ARTISTS above SONGS: 64px rows, 32px labels, name 17/22, count 14/20, divider, no console errors', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await open(context);
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(base + '/');
  await hydrated(page);
  await page.keyboard.type('eagl', { delay: 40 });
  await page.locator(ARTIST_LINKS).first().waitFor();
  await page.locator(ROWS).first().waitFor();
  const m = await page.evaluate((ARTIST_LINKS) => {
    const r = (el) => el.getBoundingClientRect();
    const cs = (el) => getComputedStyle(el);
    const links = [...document.querySelectorAll(ARTIST_LINKS)];
    const labels = [...document.querySelectorAll('main h2')].filter((h) => ['Artists', 'Songs'].includes(h.textContent));
    const first = links[0];
    const [, name, count, chevron] = first.children;
    return {
      hrefs: links.map((a) => a.getAttribute('href')),
      heights: links.map((a) => r(a).height),
      labelHeights: labels.map((l) => r(l).height),
      labelText: labels.map((l) => l.textContent),
      labelFont: [cs(labels[0]).fontSize, cs(labels[0]).lineHeight, cs(labels[0]).fontWeight, cs(labels[0]).letterSpacing, cs(labels[0]).textTransform, cs(labels[0]).paddingLeft],
      nameFont: [cs(name).fontSize, cs(name).lineHeight, cs(name).fontWeight],
      countFont: [cs(count).fontSize, cs(count).lineHeight, cs(count).fontWeight],
      chevron: [r(chevron).width, r(chevron).height],
      gapCountChevron: r(chevron).left - r(count).right,
      divider: cs(first.parentElement).borderBottomWidth,
      side: [r(name).left - r(first).left, r(first).right - r(chevron).right],
      lastLinkBottom: r(links.at(-1)).bottom,
      songsLabelTop: r(labels[1]).top,
      firstRowTop: r(document.querySelector('main ul[aria-label="Song results"] > li')).top,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  }, ARTIST_LINKS);
  assert.ok(m.hrefs.length >= 1 && m.hrefs.length <= 3, `1-3 artists (got ${m.hrefs.length})`);
  assert.ok(m.hrefs.every((h) => /^\?q=eagl&artist=[^&]+$/.test(h)), `real links ?q=eagl&artist=<id>: ${m.hrefs}`);
  assert.ok(m.heights.every((h) => h === 64), `artist rows are 64px (${m.heights})`);
  assert.deepEqual(m.labelText, ['Artists', 'Songs']);
  assert.deepEqual(m.labelHeights, [32, 32], 'labels are 32px strips');
  assert.deepEqual(m.labelFont, ['12px', '16px', '600', '0.96px', 'uppercase', '16px'], 'label 12/16 600, tracking 0.08em, caps, 16px inset');
  assert.deepEqual(m.nameFont, ['17px', '22px', '600']);
  assert.deepEqual(m.countFont, ['14px', '20px', '400']);
  assert.deepEqual(m.chevron, [20, 20]);
  assert.equal(m.gapCountChevron, 8, '8px between the count and the chevron');
  assert.equal(m.divider, '1px');
  assert.deepEqual(m.side, [16, 16], '16px side padding');
  assert.ok(m.lastLinkBottom <= m.songsLabelTop + 1 && m.songsLabelTop < m.firstRowTop, 'ARTISTS rows, then the SONGS label, then the songs');
  assert.equal(m.overflow, false);
  const first = artistById.get(idOf(m.hrefs[0]));
  assert.ok(first, 'the first artist is in the dataset');
  assert.equal(await page.getByRole('link', { name: `${first.name}, ${countText(first.count)}`, exact: true }).count(), 1, 'the link reads "<name>, N songs"');
  assert.equal(await page.locator(ARTIST_LINKS).first().locator(':scope > span').nth(2).textContent(), countText(first.count));
  await input_clear(page);
  assert.equal(await page.locator('main h2', { hasText: /^(Artists|Songs)$/ }).count(), 0, 'no labels when nothing is suggested');
  await page.locator(INPUT).fill('xyzqq');
  await page.getByRole('heading', { name: 'No songs found' }).waitFor();
  assert.equal(await page.locator(ARTIST_LINKS).count(), 0);
  assert.deepEqual(problems, [], 'no console errors');
  await context.close();
});

async function input_clear(page) {
  await page.locator(INPUT).fill('hotel californa');
  // The old rows stay until the new answer arrives, so wait for the artists of the old query to go.
  await page.locator(ARTIST_LINKS).first().waitFor({ state: 'detached' });
  await page.locator(ROWS).first().waitFor();
}

await step('tapping an artist opens the view: 80px heading, 44x44 back button, 24/30 name, count = dataset, every song as a row; Back returns', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await open(context);
  await page.goto(base + '/');
  await hydrated(page);
  await page.keyboard.type('eagl', { delay: 40 });
  await page.locator(ARTIST_LINKS).first().waitFor();
  const href = await page.locator(ARTIST_LINKS).first().getAttribute('href');
  const expected = artistById.get(idOf(href));
  const entries = await page.evaluate(() => history.length);
  await page.locator(ARTIST_LINKS).first().click();
  await page.locator(HEADING).waitFor();
  assert.equal(await page.evaluate(() => history.length), entries + 1, 'one new history entry');
  assert.equal(new URL(page.url()).search, href);
  assert.equal(await page.locator(INPUT).inputValue(), 'eagl', 'the box keeps its text');
  const m = await page.evaluate(({ HEADING, ARTIST_ROWS }) => {
    const r = (el) => el.getBoundingClientRect();
    const cs = (el) => getComputedStyle(el);
    const block = document.querySelector(HEADING);
    const back = block.querySelector('button');
    const name = block.querySelector('h2');
    const count = block.querySelector('p');
    const icon = back.querySelector('svg');
    return {
      block: [r(block).height, cs(block).borderBottomWidth, cs(block).backgroundColor],
      back: [r(back).width, r(back).height, back.getAttribute('aria-label'), cs(back).color, r(icon).width],
      name: [name.textContent, cs(name).fontSize, cs(name).lineHeight, cs(name).fontWeight, cs(name).color, r(name).left - r(back).right],
      count: [count.textContent, cs(count).fontSize, cs(count).lineHeight, cs(count).color],
      rows: document.querySelectorAll(ARTIST_ROWS).length,
      labels: [...document.querySelectorAll('main h2')].map((h) => h.textContent),
      hint: !!document.body.textContent.includes('Showing the top 50'),
      focus: document.activeElement?.getAttribute('aria-label'),
      scrollY: window.scrollY,
      live: document.querySelector('main [role="status"]').textContent,
      groups: document.querySelectorAll('[role="status"]').length,
      pageBg: cs(document.body).backgroundColor,
    };
  }, { HEADING, ARTIST_ROWS });
  assert.equal(m.block[0], 80, 'heading block is 80px');
  assert.equal(m.block[1], '1px');
  assert.equal(m.block[2], m.pageBg, 'heading block uses the page background');
  assert.deepEqual(m.back.slice(0, 3), [44, 44, 'Back to results']);
  assert.equal(m.back[4], 24, '24px chevron');
  assert.equal(m.back[3], 'rgb(244, 245, 248)', 'chevron is the primary text colour');
  assert.equal(m.name[0], expected.name);
  assert.deepEqual(m.name.slice(1, 4), ['24px', '30px', '700']);
  assert.equal(m.name[4], 'rgb(244, 245, 248)');
  assert.equal(m.name[5], 8, '8px between the chevron button and the name');
  assert.deepEqual(m.count.slice(0, 3), [countText(expected.count), '14px', '20px']);
  assert.equal(m.count[3], 'rgb(169, 174, 189)', 'count is the secondary colour');
  assert.equal(m.rows, expected.count, `every one of the artist's ${expected.count} songs is a row`);
  assert.deepEqual(m.labels, [expected.name], 'no ARTISTS/SONGS labels in the view');
  assert.equal(m.hint, false);
  assert.equal(m.focus, `${expected.name}, ${countText(expected.count)}`, 'focus is on the heading block');
  assert.equal(m.scrollY, 0);
  assert.equal(m.groups, 1, 'one live region');
  // A tap moves focus to the heading block (its name carries "<name>, N songs"), so the live region stays silent: announcing
  // the same text twice is what QA flagged. Give it longer than the 600 ms settle delay to prove it.
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => document.querySelector('main [role="status"]').textContent), '', 'live region is silent after a tap');

  await page.goBack();
  await page.locator(ARTIST_LINKS).first().waitFor();
  assert.equal(new URL(page.url()).search, '?q=eagl');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'search-input', 'Back returns focus to the box');
  await page.goForward();
  await page.locator(HEADING).waitFor();
  await page.getByRole('button', { name: 'Back to results' }).click();
  await page.locator(ARTIST_LINKS).first().waitFor();
  assert.equal(new URL(page.url()).search, '?q=eagl');
  assert.equal(await page.evaluate(() => history.length), entries + 1, 'the chevron goes Back; it adds no entries');
  await context.close();
});

await step('Back puts the results where they were scrolled', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 600 } });
  const page = await open(context);
  await page.goto(base + '/?q=queen');
  await page.locator(ARTIST_LINKS).first().waitFor();
  await page.locator(ROWS).nth(9).waitFor();
  await page.evaluate(() => window.scrollTo(0, 130));
  assert.equal(await page.evaluate(() => Math.round(window.scrollY)), 130);
  await page.locator(ARTIST_LINKS).first().evaluate((a) => a.click()); // the link is under the sticky box at this scroll: click it from script
  await page.locator(HEADING).waitFor();
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.goBack();
  await page.locator(ARTIST_LINKS).first().waitFor();
  await page.waitForFunction(() => Math.round(window.scrollY) === 130);
  await context.close();
});

await step('editing the box in the artist view leaves it (replace, no new entry); clearing goes home', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await open(context);
  await page.goto(base + '/?q=eagl');
  await hydrated(page);
  await page.locator(ARTIST_LINKS).first().click();
  await page.locator(HEADING).waitFor();
  const entries = await page.evaluate(() => history.length);
  await page.locator(INPUT).click();
  await page.keyboard.press('End');
  await page.keyboard.type('e', { delay: 30 });
  await page.locator(HEADING).waitFor({ state: 'detached' });
  assert.equal(new URL(page.url()).search, '?q=eagle');
  assert.equal(await page.evaluate(() => history.length), entries);
  await page.locator(ARTIST_LINKS).first().click();
  await page.locator(HEADING).waitFor();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await page.getByText('Find your song number').waitFor();
  assert.equal(new URL(page.url()).search, '');
  await context.close();
});

await step('deep links: ?q=eagl&artist=<id> (and its chevron stays in the app), the dotted id b.o.b, and unknown or malformed ids are ignored', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await open(context);
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  const eagles = artistById.get('eagles');
  await page.goto(base + '/?q=eagl&artist=eagles');
  await page.locator(HEADING).waitFor();
  assert.equal(await page.locator(HEADING + ' h2').textContent(), eagles.name);
  assert.equal(await page.locator(ARTIST_ROWS).count(), eagles.count);
  assert.equal(await page.locator(INPUT).inputValue(), 'eagl');
  const entries = await page.evaluate(() => history.length);
  await page.getByRole('button', { name: 'Back to results' }).click();
  await page.locator(ARTIST_LINKS).first().waitFor();
  assert.equal(new URL(page.url()).search, '?q=eagl');
  assert.equal(await page.evaluate(() => history.length), entries, 'direct load: the chevron replaces the URL, it does not leave the app');
  assert.equal(new URL(page.url()).origin, base);

  const bob = artistById.get('b.o.b');
  await page.goto(base + '/?q=bob&artist=b.o.b');
  await page.locator(HEADING).waitFor();
  assert.equal(await page.locator(HEADING + ' h2').textContent(), bob.name);
  assert.equal(await page.locator(ARTIST_ROWS).count(), bob.count);
  assert.equal(await page.locator(HEADING + ' p').textContent(), countText(bob.count));
  // the rows of the first artist link round-trip: tap B.O.B from its own search
  await page.goto(base + '/?q=b.o.b');
  await page.locator(ARTIST_LINKS).first().waitFor();
  const links = await page.locator(ARTIST_LINKS).evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  assert.ok(links.some((h) => h.endsWith('artist=b.o.b')), `a link keeps the dotted id: ${links}`);

  for (const id of ['nobody-at-all', '%E0%A4%A', '%', '..']) {
    await page.goto(`${base}/?q=eagl&artist=${id}`);
    await page.locator(ARTIST_LINKS).first().waitFor();
    assert.equal(await page.locator(HEADING).count(), 0, `artist=${id} shows the normal results`);
    await page.waitForFunction(() => !location.search.includes('artist='));
    assert.equal(new URL(page.url()).search, '?q=eagl');
  }
  await page.goto(base + '/?q=eagl&artist='); // an empty id is simply no artist
  await page.locator(ARTIST_LINKS).first().waitFor();
  assert.equal(await page.locator(HEADING).count(), 0);
  await page.goto(base + '/?artist=nobody-at-all');
  await page.getByText('Find your song number').waitFor();
  assert.equal(new URL(page.url()).search, '');
  assert.deepEqual(problems, [], 'no console errors');
  await context.close();
});

await step('the largest artist list (568 songs) opens and scrolls top to bottom at 4x CPU with no long task; typing stays responsive', async () => {
  const unknown = artistById.get('unknown');
  assert.equal(unknown.count, 568);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await open(context);
  await page.goto(base + '/?q=unknown');
  await hydrated(page);
  await page.locator(ARTIST_LINKS).first().waitFor();
  await page.waitForTimeout(400);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const m = await page.evaluate(async () => {
    const link = document.querySelector('main section[aria-label="Artists"] a');
    window.__m.longtasks.length = 0;
    const t0 = performance.now();
    link.click();
    const painted = await new Promise((resolve) => {
      const tick = () => {
        if (document.querySelector('main ul[aria-label^="Songs by"] > li')) requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - t0), 0));
        else requestAnimationFrame(tick);
      };
      tick();
    });
    await new Promise((r) => setTimeout(r, 300));
    const openTasks = window.__m.longtasks.map((t) => t.dur);
    const rows = document.querySelectorAll('main ul[aria-label^="Songs by"] > li').length;
    window.__m.longtasks.length = 0;
    const frames = [];
    let last = performance.now();
    await new Promise((resolve) => {
      const step = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        if (window.scrollY >= document.scrollingElement.scrollHeight - innerHeight - 1) return resolve();
        window.scrollBy(0, 50);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    frames.shift();
    return { painted, rows, openTasks, scrollTasks: window.__m.longtasks.map((t) => t.dur), worstFrame: Math.max(...frames), frames: frames.length };
  });
  assert.equal(m.rows, 568);
  const openWorst = Math.max(0, ...m.openTasks);
  console.log(`     4x CPU: first rows painted ${m.painted.toFixed(0)} ms after the tap, open long tasks ${m.openTasks.length} (max ${openWorst.toFixed(0)} ms); scroll ${m.frames} frames, worst ${m.worstFrame.toFixed(0)} ms, long tasks ${m.scrollTasks.length}`);
  assert.ok(openWorst < 150, `opening the list: longest task ${openWorst.toFixed(0)} ms`);
  assert.equal(m.scrollTasks.length, 0, `no long task while scrolling the 568 rows (got ${m.scrollTasks.map((d) => d.toFixed(0))})`);
  assert.ok(m.worstFrame < 100, `worst frame while scrolling ${m.worstFrame.toFixed(0)} ms`);

  // Typing while the big list is open: the keystroke leaves the view; keystroke-to-next-paint stays under 100 ms.
  await page.evaluate(() => window.scrollTo(0, 0));
  const per = await page.evaluate(async () => {
    const field = document.querySelector('#search-input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const out = [];
    for (const text of ['unknow', 'unknown']) {
      const t0 = performance.now();
      setter.call(field, text);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      out.push(performance.now() - t0);
      await new Promise((r) => setTimeout(r, 400));
    }
    return out;
  });
  console.log(`     4x CPU: keystroke-to-next-paint with the 568-row view open ${per.map((x) => x.toFixed(0)).join('/')} ms`);
  assert.ok(Math.max(...per) < 100, `keystroke ${Math.max(...per).toFixed(0)} ms (limit 100)`);
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
