/**
 * Browser-side measurement harness (bundled by scripts/measure-browser.mjs, not part of the app).
 * Runs the real engine code on the page's MAIN thread, where Chromium's CPU throttling (CDP) applies.
 * Web Workers are not throttled by CDP ("Operation is only supported for pages, not workers"), so this is how
 * the compute cost on a slower CPU is measured: the same code, the same browser, a slowed thread.
 */
import { parseDataset } from '../../src/lib/dataset.ts';
import { buildIndex, loadIndex, searchSongs, suggestArtists } from '../../src/lib/search/index.ts';

interface ComputeResult {
  parseMs: number;
  buildMs: number;
  loadIndexMs: number | null;
  firstQueryMs: number;
  keystrokeMs: number[];
}

const KEYSTROKE_QUERIES = ['hotel californa', 'yesterday', 'mr brightside', 'eagles', 'the', 'love'];

function keystrokes(): string[] {
  const out: string[] = [];
  for (const q of KEYSTROKE_QUERIES) for (let i = 1; i <= q.length; i++) out.push(q.slice(0, i));
  return out;
}

async function text(url: string): Promise<string> {
  return (await fetch(url, { cache: 'no-store' })).text();
}

async function compute(prebuiltUrl: string | null): Promise<ComputeResult> {
  const [songsJson, artistsJson] = await Promise.all([text('/data/songs.json'), text('/data/artists.json')]);
  const serialized = prebuiltUrl ? await text(prebuiltUrl) : null;
  // Let the page settle so the timed work is not competing with the fetch bookkeeping.
  await new Promise((resolve) => setTimeout(resolve, 200));

  const t0 = performance.now();
  const dataset = parseDataset(songsJson, artistsJson);
  const t1 = performance.now();
  const index = serialized === null ? buildIndex(dataset) : loadIndex(dataset, serialized);
  const t2 = performance.now();
  searchSongs(index, 'hotel californa');
  suggestArtists(index, 'hotel californa');
  const t3 = performance.now();

  const keystrokeMs: number[] = [];
  for (const q of keystrokes().slice(0, 50)) {
    const s = performance.now();
    searchSongs(index, q);
    suggestArtists(index, q);
    keystrokeMs.push(performance.now() - s);
  }
  return {
    parseMs: t1 - t0,
    buildMs: serialized === null ? t2 - t1 : 0,
    loadIndexMs: serialized === null ? null : t2 - t1,
    firstQueryMs: t3 - t2,
    keystrokeMs,
  };
}

declare global {
  interface Window {
    __bench: { compute: (prebuiltUrl: string | null) => Promise<ComputeResult> };
  }
}
window.__bench = { compute };
