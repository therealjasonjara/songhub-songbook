import type MiniSearch from 'minisearch';
import type { Artist, Song } from '../dataset';

export interface ArtistRef {
  id: string;
  name: string;
}

/** One song row as the UI needs it: no second lookup required. */
export interface SongHit {
  n: number;
  title: string;
  /** Artist credit exactly as printed. */
  credit: string;
  /** Display names (canonical) of every artist the song is listed under, main artist first. */
  artists: ArtistRef[];
}

export interface SongSearchResult {
  /** The best matches, at most `RESULT_LIMIT`. */
  results: SongHit[];
  /** Full number of songs that matched (not capped). */
  total: number;
  /** True when `total` is larger than the number of results returned. */
  hasMore: boolean;
}

export interface ArtistSuggestion {
  id: string;
  name: string;
  count: number;
}

/** A matchable artist name (canonical or alias), keyed by its normalised form. */
export interface ArtistKey {
  key: string;
  artist: number;
}

/** Built once from the dataset; treat as opaque outside `src/lib/search`. */
export interface SearchIndex {
  readonly mini: MiniSearch;
  readonly songs: readonly Song[];
  readonly artists: readonly Artist[];
  /** Normalised title per song (same order as `songs`). */
  readonly titles: readonly string[];
  /** Title with word-dots read as spaces (`mr brightside`), only for titles that have one (A-007). */
  readonly titleSplits: readonly (string | undefined)[];
  /** Normalised credit per song (joined form, then the split form when it differs), filled lazily. */
  readonly credits: (string | undefined)[];
  readonly artistIndexById: ReadonlyMap<string, number>;
  /** Song indices per artist id, A-Z by normalised title then number. */
  readonly songsOfArtist: ReadonlyMap<string, readonly number[]>;
  /** Artist names and aliases sorted by key, for prefix lookup. */
  readonly artistKeys: readonly ArtistKey[];
  /** Artist keys grouped by key length, for the close-fuzzy lookup. */
  readonly artistKeysByLength: ReadonlyMap<number, readonly ArtistKey[]>;
  /** Song indices ordered by (normalised title length, number); built on the first one-character query. */
  shortOrder: Int32Array | null;
}
