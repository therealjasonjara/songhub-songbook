'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { LOAD_ERROR_MESSAGE, SEARCH_ERROR_MESSAGE, getSearchClient, getStatusSnapshot, subscribeToStatus } from '@/lib/search/client';
import type { EngineStatus } from '@/lib/search/protocol';
import type { ArtistSuggestion, SongHit } from '@/lib/search/types';

export interface UseSearchResult {
  /** Dataset status: 'loading' (also while typing early), 'ready', or 'error'. */
  status: EngineStatus;
  /** Best matches for the latest answered query (kept while the next answer is on its way, so rows do not flash). */
  songs: SongHit[];
  /** Full number of matching songs (not capped). */
  total: number;
  hasMore: boolean;
  /** Up to 3 artist suggestions. */
  artists: ArtistSuggestion[];
  /** True while the current query has no answer yet (waiting for the index or for the reply). */
  loading: boolean;
  /** The message to show when the song book could not load, or when the current search failed; null otherwise. `retry` handles both. */
  error: string | null;
  retry: () => void;
}

interface Answer {
  query: string;
  songs: SongHit[];
  total: number;
  hasMore: boolean;
  artists: ArtistSuggestion[];
}

const NO_ANSWER: Answer = { query: '', songs: [], total: 0, hasMore: false, artists: [] };

/**
 * Search as you type, answered by the Web Worker engine (T005). The worker is started on the first render in the
 * browser, so it is already loading when the guest starts typing. Never blocks typing: every call is
 * asynchronous and a newer query supersedes an older one (superseded answers are never rendered).
 */
export function useSearch(query: string): UseSearchResult {
  const status = useSyncExternalStore(subscribeToStatus, getStatusSnapshot, () => 'loading' as const);
  const [answer, setAnswer] = useState<Answer>(NO_ANSWER);
  const [attempt, setAttempt] = useState(0);
  // The query (and retry attempt) whose request failed while the song book itself is fine.
  const [failed, setFailed] = useState<{ query: string; attempt: number } | null>(null);
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed === '') return;
    const client = getSearchClient();
    let live = true;
    Promise.all([client.search(trimmed), client.suggestArtists(trimmed)]).then(
      ([found, artists]) => {
        // `null` means a newer question superseded this one: its own effect will deliver the answer.
        if (!live || found === null || artists === null) return;
        setAnswer({ query: trimmed, songs: found.results, total: found.total, hasMore: found.hasMore, artists });
      },
      () => {
        // A failed load is reported through `status`. Anything else is this one request failing: say so, or
        // `loading` would stay true forever.
        if (live && client.status !== 'error') setFailed({ query: trimmed, attempt });
      },
    );
    return () => {
      live = false;
    };
  }, [trimmed, attempt]);

  const retry = useCallback(() => {
    getSearchClient().retry();
    setAttempt((n) => n + 1);
  }, []);

  const empty = trimmed === '';
  const requestFailed = failed !== null && failed.query === trimmed && failed.attempt === attempt;
  const current = !empty && answer.query === trimmed;
  return {
    status,
    songs: empty ? [] : answer.songs,
    total: empty ? 0 : answer.total,
    hasMore: empty ? false : answer.hasMore,
    artists: empty ? [] : answer.artists,
    loading: !empty && status !== 'error' && !current && !requestFailed,
    error: status === 'error' ? LOAD_ERROR_MESSAGE : requestFailed && !empty ? SEARCH_ERROR_MESSAGE : null,
    retry,
  };
}
