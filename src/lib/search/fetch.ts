import type { DatasetTexts } from './engine';
import { DATA_URLS } from './protocol';

/** A stalled connection must end in the retry message, not in an endless spinner. */
export const FETCH_TIMEOUT_MS = 30_000;

async function fetchText(url: string, fresh: boolean): Promise<string> {
  // `reload` (a retry) goes to the network and refreshes the HTTP cache, so a stale copy of one file cannot stick.
  const response = await fetch(url, { cache: fresh ? 'reload' : 'default', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

/** Fetches both shipped files in parallel. Used by the worker and by the main-thread fallback. */
export async function fetchDatasetTexts(fresh: boolean): Promise<DatasetTexts> {
  const [songsJson, artistsJson] = await Promise.all([fetchText(DATA_URLS.songs, fresh), fetchText(DATA_URLS.artists, fresh)]);
  return { songsJson, artistsJson };
}
