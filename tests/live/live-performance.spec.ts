import { HOTEL_NUMBER } from '../e2e/support/data';
import { SLOW_4G, measureRun, median, percentile, type RunResult } from '../e2e/support/perf';
import { LIVE_ORIGIN } from '../e2e/support/live';
import { expect, test } from '../e2e/support/test';

/**
 * ONE live performance check: cold load on Slow 4G (1.6 Mbps / 150 ms, on top of the real network) with 4x CPU, the same method as
 * A-014 (support/perf.ts). Thresholds are deliberately loose: a real CDN and the runner's own network add noise. The numbers are
 * printed so they can be set beside the A-014 table (Slow 4G, 4x: data arrived 6,275, worker ready 6,658, first results 6,707,
 * 440 ms after the data, keystroke p50/p95/max 33/41/44, 568-row open 75, dataset 954,949 B, whole first visit 1,169,159 B).
 */
const A014 = { dataArrived: 6275, firstResultsAfterData: 440, keystrokeP95: 41, artistOpen: 75, datasetBytes: 954_949, pageBytes: 1_169_159 };
const RUNS = 3;
const f = (n: number, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : 'n/a');

test('cold load on Slow 4G at 4x CPU: results after the data, keystrokes, and the bytes stay inside loose limits', async ({ browser }) => {
  test.setTimeout(300_000);
  const runs: RunResult[] = [];
  for (let i = 0; i < RUNS; i++) runs.push(await measureRun(browser, LIVE_ORIGIN ?? '', 4, SLOW_4G, HOTEL_NUMBER));
  const keys = runs.flatMap((r) => r.keystrokes);
  const med = (fn: (r: RunResult) => number) => median(runs.map(fn));
  const row = (label: string, live: string, a014: string) => `     ${label.padEnd(34)} live ${live.padStart(22)}   A-014 ${a014}\n`;
  process.stdout.write(
    `\n     LIVE perf, ${SLOW_4G.name}, 4x CPU, cold cache, median of ${RUNS} (runs listed)\n` +
      row('hydrated (ms)', `${f(med((r) => r.hydrated))}`, '2436') +
      row('data arrived (ms)', `${f(med((r) => r.dataArrived))} [${runs.map((r) => f(r.dataArrived)).join('/')}]`, `${A014.dataArrived}`) +
      row('worker ready (ms)', `${f(med((r) => r.workerReady))}`, '6658') +
      row('first results (ms)', `${f(med((r) => r.hotelRows))}`, '6707') +
      row('first results after data (ms)', `${f(med((r) => r.firstResultsAfterData))} [${runs.map((r) => f(r.firstResultsAfterData)).join('/')}]`, `${A014.firstResultsAfterData} (427-456)`) +
      row('long tasks to results (n/max ms)', `${f(med((r) => r.longTasksToResults.count))} / ${f(Math.max(...runs.map((r) => r.longTasksToResults.maxMs)))}`, '1 / 99') +
      row('keystroke p50/p95/max (ms)', `${f(median(keys), 1)}/${f(percentile(keys, 0.95), 1)}/${f(Math.max(...keys), 1)}`, '33/41/44') +
      row('open the 568-song list (ms)', `${f(med((r) => r.artistOpenMs))}`, `${A014.artistOpen}`) +
      row('dataset on the wire (B)', `${f(med((r) => r.datasetBytes))}`, `${A014.datasetBytes}`) +
      row('whole first visit (B)', `${f(med((r) => r.pageBytes))}`, `${A014.pageBytes}`),
  );
  expect(med((r) => r.firstResultsAfterData), 'first results after the data arrived (PRD 2 s; loose)').toBeLessThan(3000);
  expect(percentile(keys, 0.95), 'keystroke-to-paint p95 (PRD 100 ms; loose)').toBeLessThan(150);
  expect(keys.length, 'enough keystroke samples').toBeGreaterThanOrEqual(RUNS * 15);
  expect(med((r) => r.datasetBytes)).toBeLessThan(1_500_000);
  expect(med((r) => r.pageBytes)).toBeLessThan(2_000_000);
  expect(med((r) => r.artistOpenMs), '568-row list').toBeLessThan(400);
  expect(runs.every((r) => r.artistRows === 568)).toBe(true);
});
