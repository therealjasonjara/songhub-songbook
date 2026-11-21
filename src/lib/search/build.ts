import MiniSearch, { type Options } from 'minisearch';
import type { Dataset } from '../dataset';
import { normalize } from '../normalize';
import type { ArtistKey, SearchIndex } from './types';

/** Boost of the artist-credit field relative to the title (1). Title-only matches outrank artist-only ones. */
export const ARTIST_FIELD_BOOST = 0.4;

/**
 * Fuzzy edits allowed for a typed word, by its length (A-007, chosen by measurement on the real data):
 * none below 4 characters, 1 edit for 4-5, 2 edits for 6 or more (a swapped letter pair costs 2 edits).
 */
export function fuzzyEdits(termLength: number): number {
  if (termLength < 4) return 0;
  if (termLength < 6) return 1;
  return 2;
}

/**
 * A dot between two runs of 2+ letters/digits (`Mr.Brightside`, `Dr.Dre`, `St.Louis`) is a word break the normaliser
 * (which drops dots so that `R.E.M.` -> `rem`) hides. Single-letter segments (`R.E.M.`, `B.O.B`) never match.
 */
const WORD_DOT = /(?<=[\p{L}\p{N}\p{M}]{2})\.(?=[\p{L}\p{N}]{2})/gu;

/**
 * The normalised text with such dots read as spaces (`mr brightside`), or `undefined` when the text has none
 * (the common case: no allocation kept). The joined form is always `normalize(text)`.
 */
export function splitForm(text: string): string | undefined {
  if (!text.includes('.')) return undefined;
  const spaced = text.replace(WORD_DOT, ' ');
  if (spaced === text) return undefined;
  return normalize(spaced);
}

function words(n: string): string[] {
  return n === '' ? [] : n.split(' ');
}

function queryTokens(text: string): string[] {
  return words(normalize(text));
}

function docTokens(text: string): string[] {
  const tokens = words(normalize(text));
  const split = splitForm(text);
  if (split !== undefined) tokens.push(...words(split));
  return tokens;
}

/**
 * Options shared by the builder and `loadIndex`: a serialised index only loads with the very
 * same tokenizer, so they live in one place. Both fields are normalised with the shared normaliser.
 */
export const MINI_OPTIONS: Options = {
  idField: 'id',
  fields: ['title', 'artist'],
  // Documents index the joined words and, for `Mr.Brightside`, the split words too (A-007).
  tokenize: docTokens,
  processTerm: (term) => term,
  // Queries are plain normalised words: `mr.brightside` -> `mrbrightside` (joined form), `mr brightside` -> two words (split form).
  searchOptions: { boost: { artist: ARTIST_FIELD_BOOST }, combineWith: 'AND', tokenize: queryTokens },
};

interface Doc {
  id: number;
  title: string;
  artist: string;
}

function toDocs(ds: Dataset): Doc[] {
  return ds.songs.map((s, id) => ({ id, title: s.t, artist: s.a }));
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function prepare(ds: Dataset, mini: MiniSearch): SearchIndex {
  const titles = ds.songs.map((s) => normalize(s.t));
  const titleSplits = ds.songs.map((s) => splitForm(s.t));
  const artistIndexById = new Map<string, number>();
  ds.artists.forEach((a, i) => artistIndexById.set(a.id, i));

  // Song indices A-Z by normalised title, then number: songsByArtist inherits this order.
  const alpha = ds.songs.map((_, i) => i);
  alpha.sort((x, y) => compareStrings(titles[x] as string, titles[y] as string) || (ds.songs[x]?.n ?? 0) - (ds.songs[y]?.n ?? 0));
  const songsOfArtist = new Map<string, number[]>();
  for (const i of alpha) {
    for (const id of ds.songs[i]?.ar ?? []) {
      const list = songsOfArtist.get(id);
      if (list) list.push(i);
      else songsOfArtist.set(id, [i]);
    }
  }

  const artistKeys: ArtistKey[] = [];
  ds.artists.forEach((a, artist) => {
    const seen = new Set<string>();
    for (const name of [a.name, ...a.aliases]) {
      const key = normalize(name);
      if (key === '' || seen.has(key)) continue;
      seen.add(key);
      artistKeys.push({ key, artist });
    }
  });
  artistKeys.sort((x, y) => compareStrings(x.key, y.key) || x.artist - y.artist);
  const artistKeysByLength = new Map<number, ArtistKey[]>();
  for (const k of artistKeys) {
    const list = artistKeysByLength.get(k.key.length);
    if (list) list.push(k);
    else artistKeysByLength.set(k.key.length, [k]);
  }

  return {
    mini,
    songs: ds.songs,
    artists: ds.artists,
    titles,
    titleSplits,
    credits: new Array<string | undefined>(ds.songs.length).fill(undefined),
    artistIndexById,
    songsOfArtist,
    artistKeys,
    artistKeysByLength,
    shortOrder: null,
  };
}

/** Builds the full search index in memory. Pure: runs in a Web Worker or in Node. */
export function buildIndex(dataset: Dataset): SearchIndex {
  const mini = new MiniSearch(MINI_OPTIONS);
  mini.addAll(toDocs(dataset));
  return prepare(dataset, mini);
}

/** The full-text part of the index as a JSON string (`MiniSearch.toJSON`), for a prebuilt-index delivery. */
export function serializeIndex(index: SearchIndex): string {
  return JSON.stringify(index.mini);
}

/** Restores an index from `serializeIndex` output; the dataset must be the one it was built from. */
export function loadIndex(dataset: Dataset, serialized: string): SearchIndex {
  return prepare(dataset, MiniSearch.loadJSON(serialized, MINI_OPTIONS));
}
