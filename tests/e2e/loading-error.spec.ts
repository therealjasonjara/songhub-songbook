import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RunningServer, StartServerOptions } from '../../scripts/serve-out.mjs';
import { ERROR_TEXT, INPUT, STATUS, openApp, waitHydrated, waitWorkerReady } from './support/app';
import { LIVE } from './support/live';
import { expect, test } from './support/test';

// Smoke steps ported: 1 (data downloaded once; main thread never blocked), 4 (failed load, Try again), 5 (loading line only if typed before ready).

/** The static server is an ES module and the specs are CommonJS: load it by URL (the same server `webServer` runs). */
async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const mod = (await import(pathToFileURL(resolve('scripts/serve-out.mjs')).href)) as { startServer: (o: StartServerOptions) => Promise<RunningServer> };
  return mod.startServer(options);
}

const LONG_TASK_LIMIT_MS = 250; // a hydration task on a laptop is ~50-100 ms; the 47k-song index build would be 300+ ms
const INPUT_EVENT_LIMIT_MS = 100;

test.describe('loading', () => {
  test('the data is downloaded once (each file sent in full once) and the main thread is never blocked while it loads', async ({ page }) => {
    test.skip(LIVE, 'needs the in-process static server to see what it sent; the live suite checks the data headers and the 304 in tests/live instead');
    // Its own server, so the test can see what the server really sent. (The browser reports a revalidated 304 as a 200.)
    const own = await startServer({ port: 0, dir: 'out' });
    const served: string[] = [];
    own.server.on('request', (req, res) => {
      if (req.url?.startsWith('/data/')) res.on('finish', () => served.push(`${req.url?.split('/').pop()} ${res.statusCode}`));
    });
    try {
      await page.goto(`http://127.0.0.1:${own.port}/`);
      await page.locator(INPUT).waitFor();
      await waitHydrated(page);
      await page.keyboard.type('hotel californa', { delay: 40 });
      await waitWorkerReady(page);
      await page.waitForFunction((sel) => !document.querySelector(sel)?.textContent?.includes('Loading'), STATUS);
      const bodies = served.filter((r) => r.endsWith(' 200')).map((r) => r.split(' ')[0]).sort();
      expect(bodies, `each file's bytes are sent once (server responses: ${served.join(', ')})`).toEqual(['artists.json', 'songs.json']);
      expect(served.every((r) => r.endsWith(' 200') || r.endsWith(' 304')), 'only 200 and 304 responses').toBe(true);

      const m = await page.evaluate(() => window.__m);
      const worst = Math.max(0, ...m.longtasks.map((t) => t.dur));
      expect(worst, `longest main-thread task ${worst.toFixed(0)} ms`).toBeLessThan(LONG_TASK_LIMIT_MS);
      const typing = m.events.filter((e) => ['keydown', 'keypress', 'input', 'keyup'].includes(e.name)).map((e) => e.dur);
      const slowest = Math.max(0, ...typing);
      expect(slowest, `slowest key/input event ${slowest.toFixed(0)} ms`).toBeLessThan(INPUT_EVENT_LIMIT_MS);
    } finally {
      await own.close();
    }
  });

  test('the built HTML preloads both data files with as="fetch" and crossorigin', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const links = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]).filter((tag) => /\brel="preload"/.test(tag) && /\bas="fetch"/.test(tag));
    const hrefs = links.map((tag) => /\bhref="([^"]*)"/.exec(tag)?.[1]).sort();
    expect(hrefs, 'preload links with as="fetch" in the HTML as served').toEqual(['/data/artists.json', '/data/songs.json']);
    for (const tag of links) expect(tag, 'same-origin anonymous fetch, like the worker').toMatch(/\bcrossorigin=""/);
  });

  test('the worker\'s own requests do not download the data a second time', async ({ page }) => {
    test.skip(LIVE, 'needs the in-process static server to see what it sent');
    // What the server really sends: the preload and the worker ask for the same URL; the bytes must travel once per file.
    const own = await startServer({ port: 0, dir: 'out' });
    const served: string[] = [];
    own.server.on('request', (req, res) => {
      if (req.url?.startsWith('/data/')) res.on('finish', () => served.push(`${req.url?.split('/').pop()} ${res.statusCode}`));
    });
    try {
      await page.goto(`http://127.0.0.1:${own.port}/`);
      await waitHydrated(page);
      await page.locator(INPUT).pressSequentially('hot', { delay: 30 });
      await waitWorkerReady(page);
      await page.waitForLoadState('networkidle');
      for (const file of ['songs.json', 'artists.json']) {
        const answers = served.filter((r) => r.startsWith(`${file} `)).map((r) => r.split(' ')[1]);
        // Either the worker is answered from the preload's cache entry (one request, 200), or it revalidates (200 then 304): never two full bodies.
        expect(answers.filter((c) => c === '200'), `${file}: full bodies sent (${served.join(', ')})`).toHaveLength(1);
        expect(answers.every((c) => c === '200' || c === '304'), `${file}: only 200 and 304 (${answers})`).toBe(true);
        expect(answers.length, `${file}: at most one 200 and one 304`).toBeLessThanOrEqual(2);
      }
    } finally {
      await own.close();
    }
  });

  test('the loading line shows only when the guest typed before the data was ready', async ({ page }) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/data/artists.json', async (route) => {
      await gate; // held until the test has seen the line; waits on state, not on a timer
      await route.continue();
    });
    await page.goto('/');
    const status = page.locator(STATUS);
    await page.locator(INPUT).waitFor();
    expect(((await status.textContent()) ?? '').trim(), 'nothing is shown before the guest types').toBe('');
    await waitHydrated(page);
    await page.locator(INPUT).pressSequentially('hot', { delay: 30 });
    await expect(status).toContainText('Loading song book…');
    release();
    await waitWorkerReady(page);
    await expect(status).not.toContainText('Loading');
  });

  test('when the data is ready before the guest types, the loading line never appears', async ({ page }) => {
    await openApp(page);
    await waitWorkerReady(page);
    await page.locator(INPUT).pressSequentially('hot', { delay: 30 });
    await page.locator('main ul[aria-label="Song results"] > li').first().waitFor();
    expect(await page.locator(STATUS).textContent()).not.toContain('Loading');
  });
});

test.describe('failed load', () => {
  test('a failed load shows the retry message, keeps the typed text, and Try again recovers', async ({ page }) => {
    let blocked = true;
    await page.route('**/data/songs.json', (route) => (blocked ? route.abort('connectionfailed') : route.continue()));
    await page.goto('/');
    await waitHydrated(page);
    await page.locator(INPUT).fill('hotel');
    const alertBox = page.locator('main [role="alert"]'); // Next.js adds its own empty route announcer with role=alert
    await alertBox.waitFor();
    expect((await alertBox.locator('p').textContent())?.trim()).toBe(ERROR_TEXT);
    blocked = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await waitWorkerReady(page);
    await alertBox.waitFor({ state: 'detached' });
    expect(await page.locator(INPUT).inputValue(), 'the typed text is kept').toBe('hotel');
    await page.locator('main ul[aria-label="Song results"] > li').first().waitFor();
  });

  test('an HTTP error on the dataset (not just a dropped connection) is the same message, and recovers', async ({ page }) => {
    let broken = true;
    await page.route('**/data/artists.json', (route) => (broken ? route.fulfill({ status: 500, body: 'no' }) : route.continue()));
    await page.goto('/');
    await waitHydrated(page);
    await page.locator(INPUT).fill('hotel');
    const alertBox = page.locator('main [role="alert"]');
    await alertBox.waitFor();
    expect((await alertBox.locator('p').textContent())?.trim()).toBe(ERROR_TEXT);
    broken = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await alertBox.waitFor({ state: 'detached' });
    await page.locator('main ul[aria-label="Song results"] > li').first().waitFor();
  });
});
