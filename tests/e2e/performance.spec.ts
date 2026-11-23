import { ARTIST_LINKS, INPUT, ROWS, STATUS, openApp, waitWorkerReady } from './support/app';
import { HOTEL_NUMBER } from './support/data';
import { WIFI, SLOW_4G, measureRun, median, percentile, saveSweep, type Network, type RunResult } from './support/perf';
import { expect, test } from './support/test';

/**
 * The PRD's performance budget (PRD.md, "Performance budget"): first results within 2 s after the dataset has arrived, a
 * keystroke within 100 ms, under 1.5 MB gzipped for the dataset. Throttled desktop Chromium (CDP: main-thread CPU rate, network
 * conditions, cold cache because every run is a fresh context), not a real phone: docs/DEVICE-CHECKLIST.md is the real-device pass.
 *
 * Two parts:
 *  - a regression gate that runs with the suite (Wi-Fi so the network is not the variable, 4x CPU). The keystroke thresholds are the
 *    PRD budget itself (p95 under 100 ms; observed 38 to 42 ms) so a real regression fails; first results get the PRD's 2 s plus
 *    margin and a guard relative to the recorded baseline;
 *  - the full sweep for A-014 (Wi-Fi and Slow 4G, 4x and 6x, 3 runs each), only with `npm run measure:perf` (PERF_SWEEP=1).
 * CPU throttling applies to the page's main thread only (the search worker is not throttled: Chromium refuses it for workers, A-008).
 *
 * Smoke steps ported: 11 (keystroke cost with a large result set at 4x), 17 (the 568-row list at 4x: tap to paint, no long task, scrolling, typing).
 */

const SWEEP = process.env.PERF_SWEEP === '1';
/** Recorded baseline (A-014, Wi-Fi, 4x, cold cache, median of the sweep): ms from the dataset arriving to the first results. Observed 384 to 520 across runs. */
const BASELINE_FIRST_RESULTS_AFTER_DATA_MS = 430;
const BASELINE_FACTOR = 3;
const f = (n: number, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : 'n/a');

test.describe('performance regression gate (4x CPU, Wi-Fi, cold cache)', () => {
  let run: RunResult;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(180_000);
    run = await measureRun(browser, 'http://127.0.0.1:4173', 4, WIFI, HOTEL_NUMBER);
    const p = (xs: number[], q: number) => f(percentile(xs, q));
    // The observed values, next to the thresholds below.
    process.stdout.write(
      `     observed at 4x / Wi-Fi: data arrived ${f(run.dataArrived)} ms, worker ready ${f(run.workerReady)} ms, first results ${f(run.hotelRows)} ms (${f(run.firstResultsAfterData)} ms after the data), ` +
        `keystroke-to-paint p50/p95/max ${p(run.keystrokes, 0.5)}/${p(run.keystrokes, 0.95)}/${p(run.keystrokes, 1)} ms (n=${run.keystrokes.length}), ` +
        `568-row open ${f(run.artistOpenMs)} ms, dataset ${run.datasetBytes} B, page ${run.pageBytes} B\n`,
    );
  });

  test('first results come within 2.5 s after the dataset has arrived (PRD: 2 s; margin for a noisy machine)', () => {
    expect(run.firstResultsAfterData, `first results ${f(run.firstResultsAfterData)} ms after the data`).toBeLessThan(2500);
    expect(Number.isFinite(run.workerReadyAfterData)).toBe(true);
    expect(run.workerReadyAfterData).toBeLessThan(2500);
  });

  test(`first results stay within ${BASELINE_FACTOR}x the recorded baseline (${BASELINE_FIRST_RESULTS_AFTER_DATA_MS} ms), so a slide that is still under the 2.5 s limit is caught`, () => {
    const limit = BASELINE_FIRST_RESULTS_AFTER_DATA_MS * BASELINE_FACTOR;
    expect(run.firstResultsAfterData, `first results ${f(run.firstResultsAfterData)} ms after the data (baseline ${BASELINE_FIRST_RESULTS_AFTER_DATA_MS}, limit ${limit})`).toBeLessThan(limit);
  });

  test('a keystroke with a 50-row result paints within 100 ms at p95 (the PRD budget) and 70 ms at the median', () => {
    expect(run.keystrokes.length, 'enough samples (queries whose list changed)').toBeGreaterThanOrEqual(15);
    expect(run.keystrokeRowCounts.every((n) => n === 50), `every sample drew 50 rows (${run.keystrokeRowCounts})`).toBe(true);
    const p95 = percentile(run.keystrokes, 0.95);
    expect(p95, `keystroke-to-paint p95 ${f(p95)} ms (p50 ${f(median(run.keystrokes))})`).toBeLessThan(100);
    expect(median(run.keystrokes), `keystroke-to-paint median ${f(median(run.keystrokes))} ms`).toBeLessThan(70);
  });

  test('the dataset is under 1.5 MB gzipped on the wire (PRD) and the whole first visit under 2 MB', () => {
    expect(run.datasetBytes, `dataset ${run.datasetBytes} B`).toBeGreaterThan(100_000); // it was measured
    expect(run.datasetBytes).toBeLessThan(1_500_000);
    expect(run.pageBytes).toBeLessThan(2_000_000);
  });

  test('loading never blocks the main thread: no long task over 250 ms before the results, none over 250 ms while typing', () => {
    expect(run.longTasksToResults.maxMs, `longest task before results ${f(run.longTasksToResults.maxMs)} ms`).toBeLessThan(250);
    expect(run.keystrokeLongTasks.maxMs, `longest task while typing ${f(run.keystrokeLongTasks.maxMs)} ms`).toBeLessThan(250);
  });

  test('the largest artist list (568 songs) is fully in the DOM and painted within 250 ms of the tap, with no long task over 150 ms', () => {
    expect(run.artistRows).toBe(568);
    expect(run.artistOpenMs, `568-row list painted ${f(run.artistOpenMs)} ms after the tap`).toBeLessThan(250);
    expect(Math.max(0, ...run.artistOpenLongTasks)).toBeLessThan(150);
  });
});

test.describe('the 568-row list at 4x CPU, scrolling and typing', () => {
  test('scrolls top to bottom with no long task and no frame over 100 ms; typing over the open list stays under 100 ms per keystroke', async ({ page }) => {
    await openApp(page, '/?q=unknown');
    await page.locator(ARTIST_LINKS).first().waitFor();
    await page.waitForTimeout(400);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const m = await page.evaluate(async () => {
      (document.querySelector('main section[aria-label="Artists"] a') as HTMLAnchorElement).click();
      await new Promise<void>((resolve) => {
        const tick = () => (document.querySelector('main ul[aria-label^="Songs by"] > li') ? resolve() : requestAnimationFrame(tick));
        tick();
      });
      await new Promise((r) => setTimeout(r, 300));
      window.__m.longtasks.length = 0;
      const frames: number[] = [];
      let last = performance.now();
      await new Promise<void>((resolve) => {
        const step = () => {
          const now = performance.now();
          frames.push(now - last);
          last = now;
          if (window.scrollY >= (document.scrollingElement as Element).scrollHeight - innerHeight - 1) return resolve();
          window.scrollBy(0, 50);
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      frames.shift();
      return { rows: document.querySelectorAll('main ul[aria-label^="Songs by"] > li').length, tasks: window.__m.longtasks.map((t) => t.dur), worstFrame: Math.max(...frames), frames: frames.length };
    });
    expect(m.rows).toBe(568);
    expect(m.tasks, `long tasks while scrolling (${m.frames} frames, worst frame ${m.worstFrame.toFixed(0)} ms)`).toEqual([]);
    expect(m.worstFrame).toBeLessThan(100);

    // Typing while the big list is open: the keystroke leaves the view; keystroke to next paint stays under 100 ms.
    await page.evaluate(() => window.scrollTo(0, 0));
    const per = await page.evaluate(async () => {
      const field = document.querySelector('#search-input') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set as (v: string) => void;
      const out: number[] = [];
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
    process.stdout.write(`     4x CPU: scroll worst frame ${m.worstFrame.toFixed(0)} ms over ${m.frames} frames; keystroke-to-next-paint with the 568-row view open ${per.map((x) => x.toFixed(0)).join('/')} ms\n`);
    expect(Math.max(...per), `keystroke ${Math.max(...per).toFixed(0)} ms`).toBeLessThan(100);
  });

  test('keystroke cost with a large result set (love, 4x CPU slowdown): the slowest input event and the keystroke-to-next-paint stay under 100 ms', async ({ page }) => {
    await openApp(page);
    await waitWorkerReady(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.locator(INPUT).pressSequentially('love', { delay: 250 });
    await page.locator(ROWS).first().waitFor();
    await page.waitForFunction(() => document.querySelectorAll('main ul[aria-label="Song results"] > li').length === 50);
    // Keystroke to paint: time from each key event until the next frame after it has been drawn.
    const per = await page.evaluate(async () => {
      const field = document.querySelector('#search-input') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set as (v: string) => void;
      const out: number[] = [];
      for (const text of ['lov', 'love', 'lover', 'love']) {
        const t0 = performance.now();
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
    process.stdout.write(`     4x CPU: slowest key/input event ${Math.max(0, ...typing).toFixed(0)} ms, keystroke-to-next-paint ${per.map((x) => x.toFixed(0)).join('/')} ms\n`);
    expect(slowest, `slowest keystroke ${slowest.toFixed(0)} ms (limit 100)`).toBeLessThan(100);
    await expect(page.locator(STATUS)).toContainText('songs found');
  });
});

// Defined only with PERF_SWEEP=1 (npm run measure:perf): the suite itself never lists or skips it.
if (SWEEP) test.describe('A-014 sweep (npm run measure:perf)', () => {

  test('Wi-Fi and Slow 4G, 4x and 6x CPU, 3 cold-cache runs each', async ({ browser }, testInfo) => {
    testInfo.setTimeout(1_800_000);
    const RUNS = Number(process.env.PERF_RUNS ?? 3);
    const cells: { net: Network; cpu: number; runs: RunResult[] }[] = [];
    for (const net of [WIFI, SLOW_4G]) {
      for (const cpu of [4, 6]) {
        const runs: RunResult[] = [];
        for (let i = 0; i < RUNS; i++) runs.push(await measureRun(browser, 'http://127.0.0.1:4173', cpu, net, HOTEL_NUMBER));
        cells.push({ net, cpu, runs });
        process.stderr.write(`done ${net.name} ${cpu}x\n`);
      }
    }
    const med = (runs: RunResult[], fn: (r: RunResult) => number) => median(runs.map(fn));
    const out: string[] = [];
    out.push('| network | CPU | hydrated | data arrived | worker ready | first results (typed asap) | first results after data | long tasks to results (n / max ms) | keystroke p50 | p95 | max | 568-row open | dataset gz B | page gz B |');
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const c of cells) {
      const all = c.runs.flatMap((r) => r.keystrokes);
      out.push(
        `| ${c.net.name} | ${c.cpu}x | ${f(med(c.runs, (r) => r.hydrated))} | ${f(med(c.runs, (r) => r.dataArrived))} | ${f(med(c.runs, (r) => r.workerReady))} | ${f(med(c.runs, (r) => r.hotelRows))} | ${f(med(c.runs, (r) => r.firstResultsAfterData))} (runs: ${c.runs.map((r) => f(r.firstResultsAfterData)).join('/')}) | ${f(med(c.runs, (r) => r.longTasksToResults.count))} / ${f(Math.max(...c.runs.map((r) => r.longTasksToResults.maxMs)))} | ${f(median(all), 1)} | ${f(percentile(all, 0.95), 1)} | ${f(Math.max(...all), 1)} | ${f(med(c.runs, (r) => r.artistOpenMs))} (runs: ${c.runs.map((r) => f(r.artistOpenMs)).join('/')}) | ${f(med(c.runs, (r) => r.datasetBytes))} | ${f(med(c.runs, (r) => r.pageBytes))} |`,
      );
    }
    process.stdout.write('\n' + out.join('\n') + '\n');
    saveSweep('.measure/perf-sweep.json', { browser: browser.version(), runsPerCell: RUNS, cells });
    expect(cells.length).toBe(4);
  });
});
