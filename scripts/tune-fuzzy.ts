/** Fuzzy tuning experiment for A-007: recall of single-typo queries per rule. Run like measure-search.ts. */
import { readFileSync } from 'node:fs';
import { parseDataset } from '../src/lib/dataset.ts';
import { buildIndex } from '../src/lib/search/index.ts';
import { normalize } from '../src/lib/normalize.ts';

const ds = parseDataset(readFileSync('public/data/songs.json', 'utf8'), readFileSync('public/data/artists.json', 'utf8'));
const index = buildIndex(ds);
let seed = 777;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const ids: number[] = [];
while (ids.length < 600) {
  const i = Math.floor(rnd() * ds.songs.length);
  if (normalize(ds.songs[i]?.t ?? '').length >= 8) ids.push(i);
}
interface Case { id: number; q: string; wordLen: number }
const cases: Case[] = ids.map((id) => {
  const words = normalize(ds.songs[id]?.t ?? '').split(' ');
  const wi = Math.floor(rnd() * words.length);
  const w = [...(words[wi] as string)];
  if (w.length < 2) return { id, q: words.join(' '), wordLen: 0 };
  const k = Math.max(1, Math.floor(rnd() * (w.length - 1)));
  const r = rnd();
  if (r < 0.25) w.splice(k, 1);
  else if (r < 0.5) w.splice(k, 0, 'q');
  else if (r < 0.75) w[k] = w[k] === 'x' ? 'z' : 'x';
  else [w[k], w[k - 1]] = [w[k - 1] as string, w[k] as string];
  words[wi] = w.join('');
  return { id, q: words.join(' '), wordLen: (words[wi] as string).length };
});
const rules: Record<string, (n: number) => number> = {
  'none': () => 0,
  'A <4:0, 4-7:1, 8+:2': (n) => (n < 4 ? 0 : n < 8 ? 1 : 2),
  'B <5:0, 5-8:1, 9+:2': (n) => (n < 5 ? 0 : n < 9 ? 1 : 2),
  'C <3:0, 3-5:1, 6+:2': (n) => (n < 3 ? 0 : n < 6 ? 1 : 2),
  'D <4:0, 4+:1': (n) => (n < 4 ? 0 : 1),
  'F <4:0, 4-5:1, 6+:2': (n) => (n < 4 ? 0 : n < 6 ? 1 : 2),
  'G <4:0, 4-5:1, 6-8:2, 9+:3': (n) => (n < 4 ? 0 : n < 6 ? 1 : n < 9 ? 2 : 3),
  'E <4:0, 4-9:1, 10+:2': (n) => (n < 4 ? 0 : n < 10 ? 1 : 2),
};
for (const [name, fn] of Object.entries(rules)) {
  let found = 0, top1 = 0, top5 = 0, top50 = 0, cand = 0;
  const bucket = new Map<string, [number, number]>();
  const times: number[] = [];
  for (const c of cases) {
    const words = c.q.split(' ');
    const t = performance.now();
    const hits = index.mini.search(c.q, { prefix: (_t, i) => i === words.length - 1, fuzzy: (term) => fn(term.length) || false });
    times.push(performance.now() - t);
    cand += hits.length;
    const r = hits.findIndex((h) => h.id === c.id);
    const bk = c.wordLen < 3 ? '<3' : c.wordLen < 4 ? '3' : c.wordLen < 6 ? '4-5' : c.wordLen < 8 ? '6-7' : '8+';
    const b = bucket.get(bk) ?? [0, 0];
    b[1]++;
    if (r >= 0 && r < 50) b[0]++;
    bucket.set(bk, b);
    if (r >= 0) found++;
    if (r === 0) top1++;
    if (r >= 0 && r < 5) top5++;
    if (r >= 0 && r < 50) top50++;
  }
  // noise on correct, as-you-type queries: extra hits the rule adds over the strict search, when strict has < 50
  let extra = 0, runs = 0, extraMax = 0;
  const junk: Record<number, number> = {};
  for (const id of ids) {
    const title = normalize(ds.songs[id]?.t ?? '');
    const q = title.slice(0, Math.max(3, Math.floor(title.length * 0.7))).trim();
    const words = q.split(' ');
    const pre = (_t: string, i: number) => i === words.length - 1;
    const strict = index.mini.search(q, { prefix: pre, fuzzy: false }).length;
    if (strict >= 50) continue;
    const withFuzzy = index.mini.search(q, { prefix: pre, fuzzy: (term) => fn(term.length) || false }).length;
    runs++;
    for (const T of [1, 3, 5, 10, 50]) if (strict < T) junk[T] = (junk[T] ?? 0) + Math.min(50 - strict, withFuzzy - strict);
    extra += withFuzzy - strict;
    extraMax = Math.max(extraMax, withFuzzy - strict);
  }
  console.log(`   noise on correct queries (strict<50): ${runs} queries, avg extra ${(extra / Math.max(1, runs)).toFixed(1)}, max ${extraMax}`);
  console.log('   junk rows shown per correct query by gate T (fuzzy only when strict < T): ' + [1, 3, 5, 10, 50].map((T) => `T=${T}: ${((junk[T] ?? 0) / Math.max(1, runs)).toFixed(1)}`).join('  '));
  times.sort((a, b) => a - b);
  console.log(`${name.padEnd(24)} found ${found}/${cases.length} top1 ${top1} top5 ${top5} top50 ${top50} avgCand ${(cand / cases.length).toFixed(0)} p95 ${times[Math.floor(times.length * 0.95)]?.toFixed(1)}ms`);
  console.log('   top50 by typed-word length: ' + ['<3', '3', '4-5', '6-7', '8+'].map((k) => `${k}: ${bucket.get(k)?.[0]}/${bucket.get(k)?.[1]}`).join('  '));
}
