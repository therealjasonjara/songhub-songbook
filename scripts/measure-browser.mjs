/**
 * Measures the search load path in a real browser (T005, A-008). Not part of `npm run qa`.
 *
 *   npm run build && node scripts/measure-browser.mjs [--runs 3] [--quick]
 *
 * Uses the Chromium that Playwright already cached (found by @playwright/test 1.63.0) and the static
 * server in scripts/serve-out.mjs (gzip like a CDN) over the built `out/`. Writes .measure/results.json.
 *
 * Throttling, and what it can and cannot do:
 *  - Network: CDP Network.emulateNetworkConditions. Applies to the page and to its Web Worker (checked).
 *  - CPU: CDP Emulation.setCPUThrottlingRate. Applies to the PAGE's main thread only; Chromium refuses it for
 *    workers. So the compute cost on a slower CPU is measured by running the same engine code on the throttled
 *    main thread (part 1, `scripts/measure/harness-entry.ts`); part 2 drives the real built site (worker path
 *    with a throttled main thread, and the no-worker fallback where everything runs on the throttled thread).
 *  Throttled desktop Chromium is an approximation of a real phone, not a measurement of one.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { startServer } from './serve-out.mjs';

const args = process.argv.slice(2);
const RUNS = Number(args[args.indexOf('--runs') + 1]) || 3;
const QUICK = args.includes('--quick');

const NETWORKS = [
  { name: 'Wi-Fi 10 Mbps / 30 ms', down: 10_000_000, up: 5_000_000, rtt: 30 },
  { name: 'Slow 4G 1.6 Mbps / 150 ms', down: 1_600_000, up: 750_000, rtt: 150 },
  { name: 'Fast 3G 1.44 Mbps / 562 ms', down: 1_440_000, up: 675_000, rtt: 562.5 },
];
const CPUS = [1, 4, 6];
const VIEWPORT = { width: 390, height: 844 };
const SEARCH_TEXT = 'hotel californa';

const median = (xs) => pct(xs, 0.5);
function pct(xs, p) {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
}
const f = (n, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : 'n/a');

mkdirSync('.measure', { recursive: true });
execFileSync('npx', ['rolldown', 'scripts/measure/harness-entry.ts', '--platform', 'browser', '--format', 'iife', '-o', '.measure/harness.js'], { stdio: 'inherit' });

// The prebuilt-index variant (A-007): the serialised MiniSearch index, built once in Node.
execFileSync('npx', ['rolldown', 'scripts/measure-prebuilt.ts', '--platform', 'node', '--format', 'esm', '-o', '.measure/prebuilt.mjs'], { stdio: 'inherit' });
execFileSync('node', ['.measure/prebuilt.mjs', '.measure/prebuilt-index.json'], { stdio: 'inherit' });
const prebuilt = readFileSync('.measure/prebuilt-index.json');
const prebuiltGz = gzipSync(prebuilt, { level: 9 }).length;

const server = await startServer({ port: 0, dir: 'out' });
const base = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch();
console.log(`Chromium ${browser.version()} (Playwright cache), site at ${base}, ${RUNS} runs per cell\n`);

async function newPage(cpu, net) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  const cdp = await context.newCDPSession(page);
  if (cpu !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  if (net) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: net.rtt, downloadThroughput: net.down / 8, uploadThroughput: net.up / 8 });
  }
  return { context, page };
}

/* ------------------------------------------------ part 1: compute on a throttled thread ------------------------------------------------ */
const part1 = {};
for (const variant of ['runtime', 'prebuilt']) {
  for (const cpu of CPUS) {
    const rows = [];
    for (let r = 0; r < RUNS; r++) {
      const { context, page } = await newPage(cpu, null);
      if (variant === 'prebuilt') await page.route('**/__prebuilt.json', (route) => route.fulfill({ body: prebuilt, contentType: 'application/json' }));
      await page.goto(`${base}/404.html`);
      await page.addScriptTag({ path: '.measure/harness.js' });
      rows.push(await page.evaluate((url) => window.__bench.compute(url), variant === 'prebuilt' ? '/__prebuilt.json' : null));
      await context.close();
    }
    const all = rows.flatMap((x) => x.keystrokeMs);
    part1[`${variant}@${cpu}x`] = {
      parseMs: median(rows.map((x) => x.parseMs)),
      indexMs: median(rows.map((x) => (variant === 'runtime' ? x.buildMs : x.loadIndexMs))),
      firstQueryMs: median(rows.map((x) => x.firstQueryMs)),
      keystrokeP50: median(all),
      keystrokeP95: pct(all, 0.95),
      keystrokeMax: Math.max(...all),
      raw: rows,
    };
  }
}
console.log('PART 1 - compute on the throttled main thread (median of runs; same engine code that runs in the worker)\n');
console.log('| index | CPU | parse JSON+dataset | build / loadIndex | first query | keystroke p50 | p95 | max |');
console.log('|---|---|---|---|---|---|---|---|');
for (const [k, v] of Object.entries(part1)) {
  const [variant, cpu] = k.split('@');
  console.log(`| ${variant} | ${cpu} | ${f(v.parseMs)} ms | ${f(v.indexMs)} ms | ${f(v.firstQueryMs)} ms | ${f(v.keystrokeP50, 1)} ms | ${f(v.keystrokeP95, 1)} ms | ${f(v.keystrokeMax, 1)} ms |`);
}

/* ------------------------------------------------ part 2: the real built site ------------------------------------------------ */
const INIT_SCRIPT = `
(() => {
  const m = (window.__m = { posts: {}, replies: [], ready: null, init: null, longtasks: [], events: [], firstLi: null, fullLi: null, workerCreated: null, errors: [] });
  const Orig = window.Worker;
  if (Orig && !window.__noWorker) {
    window.Worker = class extends Orig {
      constructor(...a) {
        super(...a);
        m.workerCreated = performance.now();
        this.addEventListener('message', (e) => {
          const t = performance.now(); const d = e.data;
          if (d.type === 'ready') m.ready = t;
          else if (d.requestId !== undefined) m.replies.push({ id: d.requestId, type: d.type, t });
        });
      }
      postMessage(msg, ...r) {
        if (msg && msg.type === 'init') m.init = performance.now();
        if (msg && msg.requestId !== undefined) m.posts[msg.requestId] = { type: msg.type, t: performance.now(), q: msg.query };
        return super.postMessage(msg, ...r);
      }
    };
  } else if (window.__noWorker) { window.Worker = undefined; }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) m.longtasks.push({ start: e.startTime, dur: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch (e) { m.errors.push('longtask ' + e); }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) m.events.push({ name: e.name, start: e.startTime, dur: e.duration, delay: e.processingStart - e.startTime }); }).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch (e) { m.errors.push('event ' + e); }
  const watch = () => {
    new MutationObserver(() => {
      const li = document.querySelector('[data-testid="probe-numbers"] li');
      if (li && m.firstLi === null) m.firstLi = performance.now();
      const ol = document.querySelector('[data-testid="probe-numbers"]');
      if (ol && m.fullLi === null && m.fullTarget && ol.textContent.toLowerCase().includes(m.fullTarget)) m.fullLi = performance.now();
    }).observe(document, { childList: true, subtree: true, characterData: true });
  };
  if (document.documentElement) watch(); else document.addEventListener('DOMContentLoaded', watch);
})();`;

async function appRun({ cpu, net, noWorker }) {
  const { context, page } = await newPage(cpu, net);
  await page.addInitScript(`window.__noWorker = ${noWorker ? 'true' : 'false'};` + INIT_SCRIPT);
  const data = { done: [], sizes: [] };
  page.on('requestfinished', async (req) => {
    if (!req.url().includes('/data/')) return;
    data.done.push(Date.now());
    const s = await req.sizes().catch(() => null);
    if (s) data.sizes.push({ url: req.url().split('/').pop(), body: s.responseBodySize, headers: s.responseHeadersSize });
  });
  await page.goto(base + '/', { waitUntil: 'commit' });
  const origin = await page.evaluate(() => performance.timeOrigin);
  await page.waitForSelector('#search-input');
  // Hydrated = React has attached its props to the input (before that, typing is not wired to anything).
  await page.waitForFunction(() => { const el = document.querySelector('#search-input'); return !!el && Object.keys(el).some((k) => k.startsWith('__reactProps')); });
  await page.evaluate(() => { window.__m.fullTarget = "california"; window.__m.typeStart = performance.now(); });
  await page.click('#search-input');
  await page.keyboard.type(SEARCH_TEXT, { delay: 60 });
  // wait for results of the full query (or give up after 60 s)
  // T006 removed the probe list (rows come with T007), so "first rows" is not observable now: wait for the index instead.
  await page.waitForFunction(() => window.__m.ready !== null, null, { timeout: 90_000 }).catch(() => {});
  const early = await page.evaluate(() => JSON.parse(JSON.stringify(window.__m)));
  const loadEvent = await page.evaluate(() => { const [n] = performance.getEntriesByType('navigation'); return n ? n.loadEventEnd : null; });

  // Per-keystroke round trips, after ready: 50 realistic keystrokes at a 150 ms pace.
  let keystroke = null;
  if (!noWorker) {
    await page.waitForFunction(() => window.__m.ready !== null);
    await page.evaluate(() => { window.__m.keyStart = performance.now(); });
    const queries = ['yesterday', 'mr brightside', 'eagles', 'hotel californa', 'the', 'love'];
    let n = 0;
    for (const q of queries) {
      await page.fill('#search-input', '');
      for (const ch of q) {
        if (n >= 50) break;
        await page.keyboard.type(ch, { delay: 0 });
        await page.waitForTimeout(150);
        n++;
      }
    }
    await page.waitForTimeout(500);
    const late = await page.evaluate(() => JSON.parse(JSON.stringify(window.__m)));
    const rt = [];
    const byId = new Map(late.replies.map((r) => [r.id, r]));
    for (const [id, p] of Object.entries(late.posts)) {
      if (p.type !== 'search' || p.t < late.keyStart) continue;
      const r = byId.get(Number(id));
      if (r) rt.push(r.t - p.t);
    }
    keystroke = { count: rt.length, p50: median(rt), p95: pct(rt, 0.95), max: Math.max(...rt) };
    early.longtasks = late.longtasks;
    early.events = late.events;
  }
  await context.close();

  const readyAt = early.ready;
  const dataEnd = Math.max(...data.done) - origin; // ms since navigation start
  const longBeforeEnd = early.longtasks.filter((t) => t.start < (readyAt ?? Infinity));
  const evBeforeReady = early.events.filter((e) => e.start < (readyAt ?? Infinity) && (e.name === 'keydown' || e.name === 'keypress' || e.name === 'input' || e.name === 'keyup'));
  return {
    transferBytes: data.sizes.reduce((a, s) => a + s.body, 0),
    dataEnd,
    typeStart: early.typeStart,
    ready: readyAt,
    firstLi: early.firstLi,
    fullLi: early.fullLi,
    loadEvent,
    longTasksBeforeReady: { count: longBeforeEnd.length, totalMs: longBeforeEnd.reduce((a, t) => a + t.dur, 0), maxMs: Math.max(0, ...longBeforeEnd.map((t) => t.dur)) },
    longTasksDuringBuild: readyAt === null ? null : (() => { const w = early.longtasks.filter((t) => t.start >= dataEnd && t.start < readyAt); return { count: w.length, maxMs: Math.max(0, ...w.map((t) => t.dur)) }; })(),
    inputEventsBeforeReady: { count: evBeforeReady.length, maxDurMs: Math.max(0, ...evBeforeReady.map((e) => e.dur)), maxDelayMs: Math.max(0, ...evBeforeReady.map((e) => e.delay)) },
    keystroke,
    errors: early.errors,
  };
}

const part2 = [];
const nets = QUICK ? [NETWORKS[1]] : NETWORKS;
const cpus = QUICK ? [4] : CPUS;
for (const net of nets) {
  for (const cpu of cpus) {
    for (const noWorker of [false, true]) {
      const runs = [];
      for (let r = 0; r < RUNS; r++) runs.push(await appRun({ cpu, net, noWorker }));
      part2.push({ net: net.name, cpu, noWorker, runs });
      console.error(`done ${net.name} ${cpu}x ${noWorker ? 'main-thread fallback' : 'worker'}`);
    }
  }
}
const med = (runs, fn) => median(runs.map(fn).filter((x) => x !== null && x !== undefined && Number.isFinite(x)));
console.log('\nPART 2 - the built site, cold cache, 390x844, query typed as soon as the page hydrates (ms since navigation start; median of runs)\n');
console.log('| network | CPU (main thread) | path | dataset gz bytes | data arrived | index ready | ready - data | first row | "hotel californa" rows | long tasks before ready (n / total / max ms) | key/input event max ms before ready |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const c of part2) {
  const r = c.runs;
  console.log(
    `| ${c.net} | ${c.cpu}x | ${c.noWorker ? 'main-thread fallback' : 'worker'} | ${f(med(r, (x) => x.transferBytes))} | ${f(med(r, (x) => x.dataEnd))} | ${f(med(r, (x) => x.ready))} | ${f(med(r, (x) => (x.ready === null ? NaN : x.ready - x.dataEnd)))} | ${f(med(r, (x) => x.firstLi))} | ${f(med(r, (x) => x.fullLi))} | ${f(med(r, (x) => x.longTasksBeforeReady.count))} / ${f(med(r, (x) => x.longTasksBeforeReady.totalMs))} / ${f(med(r, (x) => x.longTasksBeforeReady.maxMs))} | ${f(med(r, (x) => x.inputEventsBeforeReady.maxDurMs))} |`,
  );
}
console.log('\nPER-KEYSTROKE round trip (worker path, post -> reply on the main thread; 50 keystrokes x runs)\n');
console.log('| network | CPU (main thread) | n | p50 | p95 | max |');
console.log('|---|---|---|---|---|---|');
for (const c of part2.filter((x) => !x.noWorker)) {
  const ks = c.runs.map((x) => x.keystroke).filter(Boolean);
  console.log(`| ${c.net} | ${c.cpu}x | ${ks.reduce((a, k) => a + k.count, 0)} | ${f(med(ks, (k) => k.p50), 1)} ms | ${f(median(ks.map((k) => k.p95)), 1)} ms | ${f(Math.max(...ks.map((k) => k.max)), 1)} ms |`);
}
console.log('\nPROJECTION - first results for the typed query, ms since navigation start, on a slower CPU');
console.log('dataset arrival = measured with the main thread throttled (worker path); compute = part 1 on the same throttle (parse + index + first query);');
console.log('prebuilt = same arrival plus the extra index bytes at the profile bandwidth (the index is downloaded in parallel with, and in addition to, the dataset), then parse + loadIndex + first query.\n');
console.log('| network | CPU | runtime build (shipped design) | prebuilt serialised index | difference |');
console.log('|---|---|---|---|---|');
for (const c of part2.filter((x) => !x.noWorker)) {
  const net = NETWORKS.find((n) => n.name === c.net);
  const arrive = med(c.runs, (x) => x.dataEnd);
  const rt = part1[`runtime@${c.cpu}x`];
  const pb = part1[`prebuilt@${c.cpu}x`];
  const runtime = arrive + rt.parseMs + rt.indexMs + rt.firstQueryMs;
  const extra = (prebuiltGz * 8 * 1000) / net.down; // ms of extra transfer, sharing the same link
  const pre = arrive + extra + pb.parseMs + pb.indexMs + pb.firstQueryMs;
  console.log(`| ${c.net} | ${c.cpu}x | ${f(runtime)} ms (compute after data: ${f(rt.parseMs + rt.indexMs + rt.firstQueryMs)} ms) | ${f(pre)} ms (compute after data: ${f(pb.parseMs + pb.indexMs + pb.firstQueryMs)} ms, +${f(extra)} ms transfer) | prebuilt ${f(pre - runtime)} ms ${pre > runtime ? 'slower' : 'faster'} |`);
}
console.log(`\nprebuilt index: ${prebuilt.length} B raw, ${prebuiltGz} B gzipped (level 9)`);
writeFileSync('.measure/results.json', JSON.stringify({ browser: browser.version(), runs: RUNS, part1, part2, prebuilt: { raw: prebuilt.length, gz: prebuiltGz } }, null, 1));
await browser.close();
await server.close();
