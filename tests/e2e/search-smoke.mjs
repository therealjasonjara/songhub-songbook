/**
 * Smoke test for T005, against the BUILT site (run `npm run build` first): the dataset loads in the worker,
 * typing a misspelt query returns results, typing is not blocked while it loads, and a failed load shows the
 * retry message and recovers. Not part of `npm run qa` yet (T009 owns the e2e suite).
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

await step('typing a misspelt query returns results, and the main thread is never blocked', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await open(context);
  const workerRequests = [];
  page.on('request', (r) => r.url().includes('/data/') && workerRequests.push(r.url().split('/').pop()));
  await page.goto(base + '/');
  const input = page.locator('#search-probe-input');
  await input.waitFor();
  await page.waitForFunction(() => Object.keys(document.querySelector('#search-probe-input')).some((k) => k.startsWith('__reactProps')));
  await input.click();
  await page.keyboard.type('hotel californa', { delay: 40 });
  const rows = page.locator('[data-testid="probe-numbers"] li');
  await rows.first().waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="probe-numbers"]')?.textContent?.includes('Hotel California'));
  assert.match((await page.locator('[role="status"]').textContent()) ?? '', /\d[\d,]* results/);
  assert.ok((await rows.count()) <= 5, 'at most the top 5 are listed');
  assert.deepEqual([...new Set(workerRequests)].sort(), ['artists.json', 'songs.json'], 'dataset loaded once, from /data/');

  const m = await page.evaluate(() => window.__m);
  assert.ok(m.ready !== null, 'the worker reported ready');
  const worst = Math.max(0, ...m.longtasks.map((t) => t.dur));
  assert.ok(worst < LONG_TASK_LIMIT_MS, `longest main-thread task ${worst.toFixed(0)} ms (limit ${LONG_TASK_LIMIT_MS})`);
  const typing = m.events.filter((e) => ['keydown', 'keypress', 'input', 'keyup'].includes(e.name)).map((e) => e.dur);
  const slowest = Math.max(0, ...typing);
  assert.ok(slowest < INPUT_EVENT_LIMIT_MS, `slowest key/input event ${slowest.toFixed(0)} ms (limit ${INPUT_EVENT_LIMIT_MS})`);
  console.log(`     longest task ${worst.toFixed(0)} ms, slowest key/input event ${slowest.toFixed(0)} ms, ${m.longtasks.length} long task(s)`);
  await context.close();
});

await step('a failed load shows the retry message, and Try again recovers', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await open(context);
  let blocked = true;
  await page.route('**/data/songs.json', (route) => (blocked ? route.abort('connectionfailed') : route.continue()));
  await page.goto(base + '/');
  await page.locator('#search-probe-input').fill('hotel');
  const alertBox = page.locator('section[aria-label="Search check"] [role="alert"]'); // Next.js adds its own empty route announcer with role=alert
  await alertBox.waitFor();
  assert.equal((await alertBox.locator('p').textContent())?.trim(), ERROR_TEXT);
  blocked = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.locator('[data-testid="probe-numbers"] li').first().waitFor();
  assert.equal(await alertBox.count(), 0, 'the error is gone after a successful retry');
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
  const status = page.locator('[role="status"]');
  await page.locator('#search-probe-input').waitFor();
  assert.equal(((await status.textContent()) ?? '').trim(), '', 'nothing is shown before the guest types');
  await page.waitForFunction(() => Object.keys(document.querySelector('#search-probe-input')).some((k) => k.startsWith('__reactProps')));
  await page.locator('#search-probe-input').pressSequentially('hot', { delay: 30 });
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Loading song book…'));
  await page.locator('[data-testid="probe-numbers"] li').first().waitFor();
  assert.doesNotMatch((await status.textContent()) ?? '', /Loading/);
  await context.close();
});

await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
