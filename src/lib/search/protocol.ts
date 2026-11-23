import type { ArtistSuggestion, SongHit, SongSearchResult } from './types';

/** Where the shipped dataset lives (A-006). Both files are fetched in parallel by whoever runs the engine. */
export const DATA_URLS = { songs: '/data/songs.json', artists: '/data/artists.json' } as const;

/** Messages the main thread sends to the engine (the worker, or the main-thread fallback). */
export type EngineRequest =
  | { type: 'init'; /** Bypass the HTTP cache (used by a retry, so a half-stale pair of files cannot stick). */ fresh: boolean }
  | { type: 'search'; requestId: number; query: string }
  | { type: 'suggestArtists'; requestId: number; query: string }
  | { type: 'songsByArtist'; requestId: number; artistId: string };

/** Messages the engine sends back. Every answer carries the `requestId` of the request it answers. */
export type EngineResponse =
  | { type: 'ready' }
  | { type: 'error'; /** Set when the failure belongs to one request instead of the whole load. */ requestId?: number; message: string }
  | { type: 'search'; requestId: number; result: SongSearchResult }
  | { type: 'suggestArtists'; requestId: number; artists: ArtistSuggestion[] }
  | { type: 'songsByArtist'; requestId: number; songs: SongHit[] };

/** The request kinds that carry a `requestId`. Each kind is latest-wins on its own. */
export type RequestKind = 'search' | 'suggestArtists' | 'songsByArtist';

export type EngineStatus = 'loading' | 'ready' | 'error';
