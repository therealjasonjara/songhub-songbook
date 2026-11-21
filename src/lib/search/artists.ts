import { normalize } from '../normalize';
import type { ArtistKey, ArtistSuggestion, SearchIndex } from './types';

export const SUGGESTION_LIMIT = 3;
/** Shortest query that can suggest an artist. */
export const MIN_SUGGEST_CHARS = 2;
/** Names at least this long (normalised) may be matched with one typo. */
export const MIN_FUZZY_NAME_CHARS = 5;

/** True when `a` and `b` differ by at most one insertion, deletion or substitution. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const d = a.length - b.length;
  if (d > 1 || d < -1) return false;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < s.length && s[i] === l[i]) i++;
  if (s.length === l.length) return s.slice(i + 1) === l.slice(i + 1);
  return s.slice(i) === l.slice(i + 1);
}

function lowerBound(keys: readonly ArtistKey[], q: string): number {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((keys[mid] as ArtistKey).key < q) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Up to 3 strongly matching artists: the normalised name (or an alias) starts with the query, or the whole
 * name is within one typo of it (names of 5+ characters). A word that only appears mid-name never matches.
 * Prefix matches come first, then typo matches; each group by song count (desc) then name. One entry per artist,
 * shown under its canonical name.
 */
export function suggestArtists(index: SearchIndex, query: string): ArtistSuggestion[] {
  const q = normalize(query);
  if (q.length < MIN_SUGGEST_CHARS) return [];

  const prefixHits = new Set<number>();
  const keys = index.artistKeys;
  for (let i = lowerBound(keys, q); i < keys.length; i++) {
    const k = keys[i] as ArtistKey;
    if (!k.key.startsWith(q)) break;
    prefixHits.add(k.artist);
  }

  const fuzzyHits = new Set<number>();
  for (let len = q.length - 1; len <= q.length + 1; len++) {
    if (len < MIN_FUZZY_NAME_CHARS) continue;
    for (const k of index.artistKeysByLength.get(len) ?? []) {
      if (!prefixHits.has(k.artist) && withinOneEdit(q, k.key)) fuzzyHits.add(k.artist);
    }
  }

  const rank = (set: Set<number>): number[] =>
    [...set]
      .sort((x, y) => {
        const a = index.artists[x];
        const b = index.artists[y];
        if (!a || !b) return 0;
        return b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      })
      .slice(0, SUGGESTION_LIMIT);

  const out: ArtistSuggestion[] = [];
  for (const i of [...rank(prefixHits), ...rank(fuzzyHits)].slice(0, SUGGESTION_LIMIT)) {
    const a = index.artists[i];
    if (a) out.push({ id: a.id, name: a.name, count: a.count });
  }
  return out;
}
