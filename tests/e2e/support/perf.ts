import { mkdirSync, writeFileSync } from 'node:fs';
import type { Browser } from '@playwright/test';
import { installMetrics } from './init';

/** Throttled-mobile measurement of the built site (the same method as scripts/measure-browser.mjs part 2, A-008/A-009). */
export interface Network {
  name: string;
  /** bits per second */
  down: number;
  up: number;
  /** round trip, ms */
  rtt: number;
}
export const WIFI: Network = { name: 'Wi-Fi 10 Mbps / 30 ms', down: 10_000_000, up: 5_000_000, rtt: 30 };
export const SLOW_4G: Network = { name: 'Slow 4G 1.6 Mbps / 150 ms', down: 1_600_000, up: 750_000, rtt: 150 };

export interface RunResult {
  cpu: number;
  network: string;
  /** all in ms since navigation start unless said otherwise */
  hydrated: number;
  dataArrived: number;
  workerReady: number;
  firstRows: number;
  hotelRows: number;
  /** hotelRows - dataArrived: the PRD's "first results within 2 s after the dataset has arrived" */
  firstResultsAfterData: number;
  workerReadyAfterData: number;
  longTasksToResults: { count: number; totalMs: number; maxMs: number };
  /** transfer, bytes on the wire (gzip, like the CDN) */
  datasetBytes: number;
  pageBytes: number;
  /** keystroke (input event) to the next paint with the new 50-row list drawn, ms, one per query */
  keystrokes: number[];
  keystrokeRowCounts: number[];
  keystrokeLongTasks: { count: number; maxMs: number };
  /** tap on the 568-song artist to the frame after all rows are in the DOM, ms */
  artistOpenMs: number;
  artistRows: number;
  artistOpenLongTasks: number[];
}

export const percentile = (xs: number[], p: number): number => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))] as number;
};
export const median = (xs: number[]): number => percentile(xs, 0.5);

/** Broad one-word queries: each matches far more than 50 songs, and each list differs from the one before. */
const BROAD_QUERIES = ['love', 'the', 'you', 'night', 'heart', 'baby', 'girl', 'my', 'time', 'one', 'all', 'me', 'dance', 'dream', 'wonder', 'rock', 'blue', 'lady', 'man', 'sweet'];

export async function measureRun(browser: Browser, baseURL: string, cpu: number, network: Network | null, hotelNumber: number): Promise<RunResult> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(120_000);
    await page.addInitScript(installMetrics);
    await page.addInitScript((n) => {
      const w = window as unknown as { __hotelAt: number | null };
      w.__hotelAt = null;
      new MutationObserver(() => {
        if (w.__hotelAt !== null) return;
        const list = document.querySelector('main ul[aria-label="Song results"]');
        if (list && (list.textContent ?? '').includes(`Song ${n}, Hotel California`)) w.__hotelAt = performance.now();
      }).observe(document, { childList: true, subtree: true });
    }, hotelNumber);
    const cdp = await context.newCDPSession(page);
    if (cpu !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    if (network) {
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: network.rtt, downloadThroughput: network.down / 8, uploadThroughput: network.up / 8 });
    }
    const dataDone: number[] = [];
    let datasetBytes = 0;
    let pageBytes = 0;
    page.on('requestfinished', async (req) => {
      const isData = req.url().includes('/data/');
      if (isData) dataDone.push(Date.now());
      const sizes = await req.sizes().catch(() => null);
      if (!sizes) return;
      pageBytes += sizes.responseBodySize + sizes.responseHeadersSize;
      if (isData) datasetBytes += sizes.responseBodySize;
    });

    await page.goto(baseURL + '/', { waitUntil: 'commit' });
    const origin = await page.evaluate(() => performance.timeOrigin);
    await page.waitForSelector('#search-input');
    // hydrated = React has attached its props to the input; the guest types as soon as that is true
    await page.waitForFunction(() => {
      const el = document.querySelector('#search-input');
      return !!el && Object.keys(el).some((k) => k.startsWith('__reactProps'));
    });
    const hydrated = await page.evaluate(() => performance.now());
    await page.click('#search-input');
    await page.keyboard.type('hotel californa', { delay: 60 });
    await page.waitForFunction(() => (window as unknown as { __hotelAt: number | null }).__hotelAt !== null, null, { timeout: 120_000 });
    const early = await page.evaluate(() => ({ m: window.__m, hotelAt: (window as unknown as { __hotelAt: number }).__hotelAt }));
    // the worker's own fetches finish before it says ready, so the last data request has finished by now
    const dataArrived = Math.max(...dataDone) - origin;
    const workerReady = early.m.ready ?? NaN;
    const toResults = early.m.longtasks.filter((t) => t.start < early.hotelAt);

    // Keystroke to paint, 50-row result lists, after ready: the input event, the worker round trip, the draw of the new rows.
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      window.__m.longtasks.length = 0;
    });
    const keys = await page.evaluate(async (queries) => {
      const field = document.querySelector('#search-input') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set as (v: string) => void;
      const list = () => document.querySelector('main ul[aria-label="Song results"]');
      const times: number[] = [];
      const counts: number[] = [];
      for (const q of queries) {
        const before = list()?.textContent ?? '';
        const t0 = performance.now();
        const painted = new Promise<number>((resolve) => {
          const done = () => requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - t0), 0));
          const observer = new MutationObserver(() => {
            const now = list()?.textContent ?? '';
            if (now !== before && now !== '') {
              observer.disconnect();
              done();
            }
          });
          observer.observe(document.querySelector('main') as Node, { childList: true, subtree: true, characterData: true });
          setTimeout(() => {
            observer.disconnect();
            resolve(-1); // the list never changed: not a sample
          }, 4000);
        });
        setter.call(field, q);
        field.dispatchEvent(new Event('input', { bubbles: true }));
        const ms = await painted;
        if (ms >= 0) {
          times.push(ms);
          counts.push(list()?.querySelectorAll(':scope > li').length ?? 0);
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      return { times, counts };
    }, BROAD_QUERIES);
    const keyTasks = await page.evaluate(() => window.__m.longtasks.map((t) => t.dur));

    // The largest artist list (568 songs): tap to the frame after every row is in the DOM.
    await page.locator('#search-input').fill('unknown');
    await page.locator('main section[aria-label="Artists"] a').first().waitFor();
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.__m.longtasks.length = 0;
    });
    const open = await page.evaluate(async () => {
      const link = document.querySelector('main section[aria-label="Artists"] a') as HTMLAnchorElement;
      const t0 = performance.now();
      link.click();
      const painted = await new Promise<number>((resolve) => {
        const tick = () => {
          if (document.querySelector('main ul[aria-label^="Songs by"] > li')) requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - t0), 0));
          else requestAnimationFrame(tick);
        };
        tick();
      });
      await new Promise((r) => setTimeout(r, 300));
      return { painted, rows: document.querySelectorAll('main ul[aria-label^="Songs by"] > li').length, tasks: window.__m.longtasks.map((t) => t.dur) };
    });

    return {
      cpu,
      network: network?.name ?? 'none',
      hydrated,
      dataArrived,
      workerReady,
      firstRows: early.m.firstRows ?? NaN,
      hotelRows: early.hotelAt,
      firstResultsAfterData: early.hotelAt - dataArrived,
      workerReadyAfterData: workerReady - dataArrived,
      longTasksToResults: { count: toResults.length, totalMs: toResults.reduce((a, t) => a + t.dur, 0), maxMs: Math.max(0, ...toResults.map((t) => t.dur)) },
      datasetBytes,
      pageBytes,
      keystrokes: keys.times,
      keystrokeRowCounts: keys.counts,
      keystrokeLongTasks: { count: keyTasks.length, maxMs: Math.max(0, ...keyTasks) },
      artistOpenMs: open.painted,
      artistRows: open.rows,
      artistOpenLongTasks: open.tasks,
    };
  } finally {
    await context.close();
  }
}

export function saveSweep(file: string, payload: unknown): void {
  mkdirSync('.measure', { recursive: true });
  writeFileSync(file, JSON.stringify(payload, null, 1));
}
