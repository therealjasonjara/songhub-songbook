/**
 * Smoke test for T005/T006, against the BUILT site (run `npm run build` first): the dataset loads in the worker,
 * the page is ready to type, the query is mirrored to ?q=, the dataset loads in the worker (each file's bytes once),
 * typing is not blocked while it loads, the theme toggle works, and a failed load shows the retry message and recovers.
 * Result rows do not exist yet (T007), so what comes back from a search is not asserted here. Not part of `npm run qa` yet (T009 owns the e2e suite).
 *
 *   npm run e2e:smoke
 */
import assert from 'node:assert/strict';
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
