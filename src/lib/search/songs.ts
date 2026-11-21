import { normalize } from '../normalize';
import { fuzzyEdits, splitForm } from './build';
import type { ArtistRef, SearchIndex, SongHit, SongSearchResult } from './types';

/** Best matches returned per query; `total` still counts every match. */
export const RESULT_LIMIT = 50;

/**
 * Fuzzy matching only runs when fewer exact/prefix matches than this exist (A-007): a typo is the only reason to need it,
 * and with more real matches the fuzzy rows would just be noise below them.
 */
const FUZZY_WHEN_BELOW = 5;

/**
 * Ranking tiers, best first. Within a tier: typo cost (fuzzy tier only), MiniSearch score, shorter title, number.
 * 0 whole title equals the query
 * 1 title starts with the query as whole words      2 title starts with the query (last word partial)
 * 3 query is a phrase from a title word, whole words 4 same, last word partial
 * 5 every typed word starts some title word (any order)
 * 6 every word is found in title + credit (the title alone failed, so title-only beats credit-only)
 * 7 needs typo tolerance
 */
const TIER_FUZZY = 7;

const EMPTY: SongSearchResult = { results: [], total: 0, hasMore: false };

function artistRefs(index: SearchIndex, i: number): ArtistRef[] {
  const out: ArtistRef[] = [];
  for (const id of index.songs[i]?.ar ?? []) {
    const ai = index.artistIndexById.get(id);
    const artist = ai === undefined ? undefined : index.artists[ai];
    if (artist) out.push({ id: artist.id, name: artist.name });
  }
  return out;
}

export function toHit(index: SearchIndex, i: number): SongHit {
  const song = index.songs[i];
  if (!song) throw new Error(`No song at index ${i}`);
  return { n: song.n, title: song.t, credit: song.a, artists: artistRefs(index, i) };
}

function creditOf(index: SearchIndex, i: number): string {
  let c = index.credits[i];
  if (c === undefined) {
    const raw = index.songs[i]?.a ?? '';
    const split = splitForm(raw);
    c = split === undefined ? normalize(raw) : `${normalize(raw)} ${split}`;
    index.credits[i] = c;
  }
  return c;
}

/** Tier 0-5 of one spelling of the title, or `TIER_FUZZY` when it is none of them. */
function titleTier(title: string, query: string, words: readonly string[]): number {
  if (title === query) return 0;
  if (title.startsWith(`${query} `)) return 1;
  if (title.startsWith(query)) return 2;
  const padded = ` ${title}`;
  const needle = ` ${query}`;
  if (`${padded} `.includes(`${needle} `)) return 3;
  if (padded.includes(needle)) return 4;
  if (words.every((w) => padded.includes(` ${w}`))) return 5;
  return TIER_FUZZY;
}

/** A title printed `Mr.Brightside` counts as both `mrbrightside` and `mr brightside`: the better tier wins. */
function tierOf(index: SearchIndex, i: number, query: string, words: readonly string[]): number {
  let tier = titleTier(index.titles[i] as string, query, words);
  const alt = index.titleSplits[i];
  if (alt !== undefined && tier > 0) tier = Math.min(tier, titleTier(alt, query, words));
  if (tier < TIER_FUZZY) return tier;
  const padded = ` ${index.titles[i] as string}${alt === undefined ? '' : ` ${alt}`}`;
  const full = `${padded} ${creditOf(index, i)}`;
  if (words.every((w) => full.includes(` ${w}`))) return 6;
  return TIER_FUZZY;
}

/** Levenshtein distance (insert, delete, substitute) between two short strings. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min((prev[j] as number) + 1, (row[j - 1] as number) + 1, (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length] as number;
}

/**
 * Typo cost of a fuzzy hit: per typed word, the smallest edit distance to a title word (a credit word costs 0.5 more;
 * the last word may also match as the start of a longer word, at +0.25). The closest spelling wins over rarer-word luck in the score.
 */
function typoCost(index: SearchIndex, i: number, words: readonly string[]): number {
  const alt = index.titleSplits[i];
  const titleWords = (alt === undefined ? (index.titles[i] as string) : `${index.titles[i] as string} ${alt}`).split(' ');
  const creditWords = creditOf(index, i).split(' ');
  let total = 0;
  words.forEach((w, k) => {
    const isLast = k === words.length - 1;
    let best = Infinity;
    const consider = (candidates: string[], extra: number) => {
      for (const c of candidates) {
        let d = editDistance(w, c);
        if (isLast && c.length > w.length) d = Math.min(d, editDistance(w, c.slice(0, w.length)) + 0.25);
        if (d + extra < best) best = d + extra;
      }
    };
    consider(titleWords, 0);
    consider(creditWords, 0.5);
    total += best;
  });
  return total;
}

/** Tie-break shared by every path: shorter normalised title, then number. */
function byLengthThenNumber(index: SearchIndex, x: number, y: number): number {
  return (index.titles[x] as string).length - (index.titles[y] as string).length || (index.songs[x]?.n ?? 0) - (index.songs[y]?.n ?? 0);
}

function shortOrder(index: SearchIndex): Int32Array {
  if (!index.shortOrder) {
    const order = Int32Array.from(index.songs, (_, i) => i);
    order.sort((x, y) => byLengthThenNumber(index, x, y));
    index.shortOrder = order;
  }
  return index.shortOrder;
}

/**
 * One-character query (A-007): no scoring and no MiniSearch. Songs with a title word starting with the character
 * are the matches; titles that start with it come first, then the rest, each in (shorter title, number) order.
 * One cheap linear scan over precomputed titles counts everything; only the first 50 per tier are kept.
 */
function searchOneChar(index: SearchIndex, ch: string): SongSearchResult {
  const order = shortOrder(index);
  const starts: number[] = [];
  const inside: number[] = [];
  let total = 0;
  const needle = ` ${ch}`;
  for (const i of order) {
    const title = index.titles[i] as string;
    const alt = index.titleSplits[i];
    if (title.startsWith(ch)) {
      total++;
      if (starts.length < RESULT_LIMIT) starts.push(i);
    } else if (title.includes(needle) || (alt !== undefined && (alt.startsWith(ch) || alt.includes(needle)))) {
      total++;
      if (inside.length < RESULT_LIMIT) inside.push(i);
    }
  }
  const picked = [...starts, ...inside].slice(0, RESULT_LIMIT);
  return { results: picked.map((i) => toHit(index, i)), total, hasMore: total > RESULT_LIMIT };
}

/** Title search: typo tolerant, matches anywhere, AND across words, last word is a prefix. */
export function searchSongs(index: SearchIndex, query: string): SongSearchResult {
  const nq = normalize(query);
  if (nq === '') return EMPTY;
  if (nq.length === 1) return searchOneChar(index, nq);
  const words = nq.split(' ');
  const last = words.length - 1;
  const prefix = (_term: string, i: number) => i === last;

  let hits = index.mini.search(nq, { prefix, fuzzy: false });
  if (hits.length < FUZZY_WHEN_BELOW) {
    hits = index.mini.search(nq, {
      prefix,
      fuzzy: (term) => {
        const e = fuzzyEdits(term.length);
        return e === 0 ? false : e;
      },
    });
  }
  if (hits.length === 0) return EMPTY;

  const ids = new Int32Array(hits.length);
  const scores = new Float64Array(hits.length);
  const tiers = new Uint8Array(hits.length);
  const costs = new Float64Array(hits.length);
  const position = new Int32Array(hits.length);
  hits.forEach((h, k) => {
    const id = h.id as number;
    ids[k] = id;
    scores[k] = h.score;
    const tier = tierOf(index, id, nq, words);
    tiers[k] = tier;
    if (tier === TIER_FUZZY) costs[k] = typoCost(index, id, words);
    position[k] = k;
  });
  position.sort(
    (a, b) =>
      (tiers[a] as number) - (tiers[b] as number) ||
      (costs[a] as number) - (costs[b] as number) ||
      (scores[b] as number) - (scores[a] as number) ||
      byLengthThenNumber(index, ids[a] as number, ids[b] as number),
  );
  const top = Array.from(position.subarray(0, RESULT_LIMIT), (k) => toHit(index, ids[k] as number));
  return { results: top, total: hits.length, hasMore: hits.length > RESULT_LIMIT };
}

/** Every song listed under the artist (including as a featured artist), A-Z by normalised title, then number. */
export function songsByArtist(index: SearchIndex, artistId: string): SongHit[] {
  return (index.songsOfArtist.get(artistId) ?? []).map((i) => toHit(index, i));
}
