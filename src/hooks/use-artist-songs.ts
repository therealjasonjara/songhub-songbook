'use client';

import { useCallback, useEffect, useState } from 'react';
import { artistHeading, type ArtistHeading } from '@/lib/artist-view';
import { getSearchClient } from '@/lib/search/client';
import type { SongHit } from '@/lib/search/types';

export interface UseArtistSongsResult {
  /**
   * `idle`: no artist open. `loading`: waiting for the song book or the reply. `ready`: the list is here.
   * `unknown`: the song book has nobody with that id. `failed`: the question failed (the song book itself is fine).
   */
  status: 'idle' | 'loading' | 'ready' | 'unknown' | 'failed';
  heading: ArtistHeading | null;
  /** The artist's full list, A-Z by title, uncapped. */
  songs: SongHit[];
  retry: () => void;
}

interface Answer {
  id: string;
  songs: SongHit[];
}

const NONE: SongHit[] = [];

/** The full song list of one artist from the worker engine (T005). A newer question supersedes an older one. */
export function useArtistSongs(artistId: string | null): UseArtistSongsResult {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState<{ id: string; attempt: number } | null>(null);

  useEffect(() => {
    if (artistId === null) return;
    const client = getSearchClient();
    let live = true;
    client.songsByArtist(artistId).then(
      (songs) => {
        // `null`: a newer question superseded this one, its own effect delivers the answer.
        if (live && songs !== null) setAnswer({ id: artistId, songs });
      },
      () => {
        // A failed load is reported through the search status; this is one question failing.
        if (live && client.status !== 'error') setFailed({ id: artistId, attempt });
      },
    );
    return () => {
      live = false;
    };
  }, [artistId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (artistId === null) return { status: 'idle', heading: null, songs: NONE, retry };
  const current = answer !== null && answer.id === artistId ? answer : null;
  if (current === null) {
    const requestFailed = failed !== null && failed.id === artistId && failed.attempt === attempt;
    return { status: requestFailed ? 'failed' : 'loading', heading: null, songs: NONE, retry };
  }
  const heading = artistHeading(current.songs, artistId);
  return heading === null ? { status: 'unknown', heading: null, songs: NONE, retry } : { status: 'ready', heading, songs: current.songs, retry };
}
