/**
 * Measures the search engine on the real dataset (A-007). Not part of the app or of `npm run qa`.
 * Run: npx rolldown scripts/measure-search.ts --platform node --format esm -o /tmp/measure-search.mjs && node --expose-gc /tmp/measure-search.mjs
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { parseDataset } from '../src/lib/dataset.ts';
import { buildIndex, loadIndex, searchSongs, serializeIndex, suggestArtists, songsByArtist } from '../src/lib/search/index.ts';

const songsJson = readFileSync('public/data/songs.json', 'utf8');
const artistsJson = readFileSync('public/data/artists.json', 'utf8');
const ds = parseDataset(songsJson, artistsJson);
const gc = (globalThis as { gc?: () => void }).gc;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
}
function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] as number;
}

// Build time (5 runs) and heap
const builds: number[] = [];
let index = buildIndex(ds);
for (let r = 0; r < 5; r++) {
  gc?.();
  const t = performance.now();
  index = buildIndex(ds);
  builds.push(performance.now() - t);
}
console.log('build ms (5 runs):', builds.map((x) => x.toFixed(0)).join(', '), 'median', median(builds).toFixed(0));
const keep: unknown[] = [];
gc?.();
const before = process.memoryUsage().heapUsed;
const dsOnly = parseDataset(songsJson, artistsJson);
keep.push(dsOnly);
gc?.();
const afterDs = process.memoryUsage().heapUsed;
keep.push(buildIndex(dsOnly));
gc?.();
const afterIdx = process.memoryUsage().heapUsed;
console.log(`heap: dataset ~${((afterDs - before) / 1048576).toFixed(1)} MB, index on top ~${((afterIdx - afterDs) / 1048576).toFixed(1)} MB (${keep.length} kept)`);

// Serialised
const ser = serializeIndex(index);
const gz = gzipSync(ser, { level: 9 }).length;
console.log(`serialised index: ${ser.length} B raw, ${gz} B gzipped; dataset raw ${songsJson.length + artistsJson.length}, gz ${gzipSync(songsJson, { level: 9 }).length + gzipSync(artistsJson, { level: 9 }).length}`);
let t = performance.now();
const loaded = loadIndex(ds, ser);
console.log('loadJSON ms', (performance.now() - t).toFixed(0));
t = performance.now();
void searchSongs(loaded, 'hotel californa');
console.log('loaded index query ok', (performance.now() - t).toFixed(1), 'ms');

const fresh = buildIndex(ds);
t = performance.now();
void searchSongs(fresh, 'a');
console.log('first one-character query on a fresh index (builds the length order once):', (performance.now() - t).toFixed(1), 'ms');
t = performance.now();
void searchSongs(fresh, 'the');
console.log('first "the" on a fresh index:', (performance.now() - t).toFixed(1), 'ms');

// Query set
const queries: { q: string; kind: string }[] = [];
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
const titles = ds.songs.map((s) => s.t).filter((x) => x.length > 6);
for (let i = 0; i < 40; i++) {
  const title = pick(titles);
  for (const n of [1, 2, 3, 4, 6, 9]) queries.push({ q: title.slice(0, n), kind: `prefix${n}` });
}
for (let i = 0; i < 60; i++) {
  const title = pick(titles);
  const chars = [...title];
  const k = 1 + Math.floor(rnd() * (chars.length - 2));
  const kind = rnd();
  if (kind < 0.33) chars.splice(k, 1);
  else if (kind < 0.66) chars.splice(k, 0, chars[k] as string);
  else [chars[k], chars[k - 1]] = [chars[k - 1] as string, chars[k] as string];
  queries.push({ q: chars.join(''), kind: 'typo' });
}
for (const a of ds.artists.slice(0, 120)) queries.push({ q: a.name, kind: 'artist' });
for (let i = 0; i < 60; i++) {
  const w = pick(titles).split(/\s+/);
  queries.push({ q: w.slice(0, 2).join(' '), kind: 'two-word' });
}
for (const q of ['a', 'e', 's', 't', 'the', 'love', 'you', 'me', 'my', 'of', 'in', 'i', 'to', 'th', 'lo', 'the love', 'i love you', 'love you', 'a b', 'in the', 'the the', 'o', 'x', 'z', 'my heart', 'baby', 'christmas', 'tagalog', 'hotel california eagles', 'eagles hotel', 'taylor swift', 'xyzzy', 'qqqq', 'the a', 'i you', 'the of', 'to me', 'in love', 'the love of my life']) queries.push({ q, kind: 'worst' });
console.log('queries:', queries.length);

for (const w of queries.slice(0, 50)) void searchSongs(index, w.q); // warm up
const all: number[] = [];
const byKind = new Map<string, number[]>();
const slow: { q: string; ms: number }[] = [];
for (const { q, kind } of queries) {
  const t0 = performance.now();
  void searchSongs(index, q);
  void suggestArtists(index, q);
  const ms = performance.now() - t0;
  all.push(ms);
  const l = byKind.get(kind) ?? [];
  l.push(ms);
  byKind.set(kind, l);
  slow.push({ q, ms });
}
console.log(`ALL median ${median(all).toFixed(2)} ms, p95 ${pct(all, 0.95).toFixed(2)} ms, p99 ${pct(all, 0.99).toFixed(2)}, max ${Math.max(...all).toFixed(1)}`);
for (const [k, v] of byKind) console.log(`  ${k.padEnd(10)} n=${String(v.length).padStart(3)} median ${median(v).toFixed(2)} p95 ${pct(v, 0.95).toFixed(2)} max ${Math.max(...v).toFixed(1)}`);
slow.sort((a, b) => b.ms - a.ms);
console.log('slowest:', slow.slice(0, 8).map((s) => `${JSON.stringify(s.q)} ${s.ms.toFixed(1)}`).join(' | '));
const art = ds.artists[0];
if (art) {
  t = performance.now();
  const l = songsByArtist(index, art.id).length;
  console.log(`songsByArtist(${art.name}) ${l} songs ${(performance.now() - t).toFixed(2)} ms`);
}
