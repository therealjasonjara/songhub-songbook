import { parseDataset, type Dataset } from '../dataset';
import { buildIndex } from './build';
import { suggestArtists } from './artists';
import { searchSongs, songsByArtist } from './songs';
import type { EngineRequest, EngineResponse } from './protocol';
import type { SearchIndex } from './types';

/** The raw text of the two shipped files. Fetching them is the caller's job (the worker, the fallback, or a Node test). */
export interface DatasetTexts {
  songsJson: string;
  artistsJson: string;
}

export interface EngineRunnerOptions {
  /** Gets the dataset text. `fresh` asks for a network fetch that skips any HTTP cache. */
  load: (fresh: boolean) => Promise<DatasetTexts>;
  /** Sends a message to the main thread. */
  post: (response: EngineResponse) => void;
  /** Index builder; defaults to the synchronous `buildIndex`. The main-thread fallback passes a chunked one. */
  build?: (dataset: Dataset) => SearchIndex | Promise<SearchIndex>;
}

export interface EngineRunner {
  handle: (request: EngineRequest) => void;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The message handlers, with no worker or DOM API in sight: the worker, the main-thread fallback and the Node
 * integration test all run this same code. `init` loads and builds, then answers `ready` (or `error`);
 * the query messages are answered with the same `requestId`.
 */
export function createEngineRunner(options: EngineRunnerOptions): EngineRunner {
  const { load, post, build = buildIndex } = options;
  let index: SearchIndex | null = null;
  let generation = 0;

  async function init(fresh: boolean): Promise<void> {
    const mine = ++generation;
    index = null;
    try {
      const { songsJson, artistsJson } = await load(fresh);
      const built = await build(parseDataset(songsJson, artistsJson));
      if (mine !== generation) return;
      index = built;
      post({ type: 'ready' });
    } catch (error) {
      if (mine !== generation) return;
      post({ type: 'error', message: describe(error) });
    }
  }

  function handle(request: EngineRequest): void {
    if (request.type === 'init') {
      void init(request.fresh);
      return;
    }
    if (index === null) {
      post({ type: 'error', requestId: request.requestId, message: 'The song book is not loaded yet.' });
      return;
    }
    try {
      switch (request.type) {
        case 'search':
          post({ type: 'search', requestId: request.requestId, result: searchSongs(index, request.query) });
          break;
        case 'suggestArtists':
          post({ type: 'suggestArtists', requestId: request.requestId, artists: suggestArtists(index, request.query) });
          break;
        case 'songsByArtist':
          post({ type: 'songsByArtist', requestId: request.requestId, songs: songsByArtist(index, request.artistId) });
          break;
      }
    } catch (error) {
      post({ type: 'error', requestId: request.requestId, message: describe(error) });
    }
  }

  return { handle };
}
