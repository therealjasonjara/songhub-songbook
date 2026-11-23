'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MusicNoteIcon } from '@/components/icons';
import { ArtistMatches } from '@/components/artist-matches';
import { ArtistView } from '@/components/artist-view';
import { NoResults } from '@/components/no-results';
import { ResultsList } from '@/components/results-list';
import { SEARCH_INPUT_ID, SearchBox } from '@/components/search-box';
import { useArtistSongs } from '@/hooks/use-artist-songs';
import { useNavigation } from '@/hooks/use-navigation';
import { useSearch } from '@/hooks/use-search';
import { useSettledValue } from '@/hooks/use-settled-value';
import { artistLabel } from '@/lib/artist-view';
import { readHistoryState } from '@/lib/query-url';
import { LOAD_ERROR_MESSAGE, SEARCH_ERROR_MESSAGE } from '@/lib/search/client';
import { hasSearchableText, resultAnnouncement } from '@/lib/search/announce';
import { normalize } from '@/lib/normalize';

/** How long a query must stay unchanged before the result count is announced. */
const ANNOUNCE_DELAY_MS = 600;

/** What the guest sees before typing (docs/SHARED_COMPONENTS.md, component 8). */
export function HomeState() {
  return (
    <section aria-labelledby="home-title" className="flex flex-col items-center text-center">
      <MusicNoteIcon size={48} className="text-accent" />
      <h2 id="home-title" className="mt-4 text-[20px] leading-7 font-bold text-text">
        Find your song number
      </h2>
      <p className="mt-2 text-base leading-6 text-text-secondary">Type a song title or an artist.</p>
      <p className="mt-2 text-[14px] leading-5 text-text-muted">About 47,000 songs</p>
    </section>
  );
}

export interface SearchStatusProps {
  /** The guest has typed something. */
  typed: boolean;
  /** The song book is still loading. */
  loading: boolean;
  /** The message to show when something failed; null when all is well. */
  error: string | null;
  retry: () => void;
  /** The settled result count to read out (already debounced), or null. */
  announcement?: string | null;
}

/**
 * The loading line, the error and the live region. The one live region is always in the page: it shows the
 * loading line, and otherwise carries the settled result count, visually hidden.
 */
export function SearchStatus({ typed, loading, error, retry, announcement = null }: SearchStatusProps) {
  return (
    <>
      <div role="status" aria-live="polite" className="text-center text-base leading-6 text-text-secondary">
        {typed && loading && error === null ? 'Loading song book…' : null}
        {announcement !== null ? <span className="sr-only">{announcement}</span> : null}
      </div>
      {error !== null ? (
        <div role="alert" className="flex flex-col items-center text-center">
          <p className="text-base leading-6 text-text">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 h-12 rounded-button bg-accent px-6 text-base leading-6 font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Try again
          </button>
        </div>
      ) : null}
    </>
  );
}

/**
 * The search screen under the header. The text is in the address bar (`?q=`) and so is the open artist
 * (`?artist=`); results are produced by `useSearch`, the artist's list by `useArtistSongs`. Exactly one of these
 * shows under the box: home, loading line, error, results (artists above songs), no results, or the artist view.
 */
export function SearchApp() {
  const { query, artist, setQuery, openArtist, closeArtist, dropArtist } = useNavigation();
  const search = useSearch(query);
  const artistSongs = useArtistSongs(artist);
  // An id the song book does not know is ignored: the normal results (or home) for `q` show, and the URL is cleaned.
  const unknownArtist = artistSongs.status === 'unknown';
  const inArtistView = artist !== null && !unknownArtist;
  // Whitespace- or punctuation-only input has nothing to search for: it is the home state again.
  const typed = hasSearchableText(query, normalize);
  // Not-loading means the dataset is ready or has failed; the hook's `loading` also covers "waiting for the reply".
  const waitingForSongBook = search.status === 'loading';
  const loadFailed = search.status === 'error';
  const ready = search.status === 'ready' && search.error === null;
  // Only an answered query may say "No songs found"; while the next answer is in flight the previous rows stay.
  const answered = typed && ready && !search.loading;
  const showArtists = !inArtistView && typed && ready && search.artists.length > 0;
  const showList = !inArtistView && typed && ready && search.songs.length > 0;
  // Artists but no songs: the artists are the answer, so no empty state.
  const showEmpty = !inArtistView && answered && search.total === 0 && search.artists.length === 0;
  // A tap moves focus to the heading block, whose accessible name already says "<name>, N songs"; announcing the same
  // text in the live region as well would be read twice (QA, A-012). It is announced only where focus does not move
  // (a direct load, or Forward into the artist view).
  const [focusMovesToHeading, setFocusMovesToHeading] = useState(false);
  const artistMessage =
    inArtistView && artistSongs.heading !== null && !focusMovesToHeading
      ? artistLabel(artistSongs.heading.name, artistSongs.heading.count)
      : null;
  const resultMessage = !inArtistView && answered ? resultAnnouncement(search.total) : null;
  // One live region: the artist and its count when the view opens, otherwise the result count (after the query settles).
  const announcement = useSettledValue(artistMessage ?? resultMessage, artistMessage !== null ? 0 : ANNOUNCE_DELAY_MS);
  let error = search.error;
  if (inArtistView) error = loadFailed ? LOAD_ERROR_MESSAGE : artistSongs.status === 'failed' ? SEARCH_ERROR_MESSAGE : null;
  const retry = () => {
    search.retry();
    artistSongs.retry();
  };

  const headingRef = useRef<HTMLDivElement>(null);
  const focusHeadingWhenReady = useRef(false);
  const wasInArtistView = useRef(false);

  // A new query starts at the top: results scroll under the sticky strip.
  useEffect(() => {
    const scroller = document.scrollingElement;
    if (scroller) scroller.scrollTop = 0;
  }, [query]);

  // A made-up or outdated `?artist=` id is dropped from the address bar (replace, no history entry).
  useEffect(() => {
    if (unknownArtist) dropArtist();
  }, [unknownArtist, dropArtist]);

  // Opening an artist starts at the top of its list.
  useEffect(() => {
    if (artist === null) return;
    const scroller = document.scrollingElement;
    if (scroller) scroller.scrollTop = 0;
  }, [artist]);

  // A tap on an artist moves focus to the heading block once it exists; a direct load keeps focus in the search box.
  useEffect(() => {
    if (artistSongs.status === 'ready' && focusHeadingWhenReady.current) {
      focusHeadingWhenReady.current = false;
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [artistSongs.status, artist]);

  // Back to the results: focus returns to the search box and the results are scrolled to where they were.
  useLayoutEffect(() => {
    if (wasInArtistView.current && !inArtistView) {
      setFocusMovesToHeading(false);
      document.getElementById(SEARCH_INPUT_ID)?.focus({ preventScroll: true });
      const scroller = document.scrollingElement;
      if (scroller) scroller.scrollTop = readHistoryState(window.history.state).songbookScrollY ?? 0;
    }
    wasInArtistView.current = inArtistView;
  }, [inArtistView]);

  function onOpenArtist(artistId: string) {
    focusHeadingWhenReady.current = true;
    setFocusMovesToHeading(true);
    openArtist(artistId);
  }

  const hasBlocks = showArtists || showList || (inArtistView && artistSongs.status === 'ready');

  return (
    <>
      <SearchBox value={query} onChange={setQuery} />
      {showArtists ? <ArtistMatches query={query} artists={search.artists} onOpen={onOpenArtist} /> : null}
      {showList ? <ResultsList songs={search.songs} hasMore={search.hasMore} showLabel={showArtists} /> : null}
      {inArtistView && artistSongs.status === 'ready' && artistSongs.heading !== null ? (
        <ArtistView heading={artistSongs.heading} songs={artistSongs.songs} onBack={closeArtist} headingRef={headingRef} />
      ) : null}
      {/* 56px here + the box's 8px bottom padding = 64px below the field */}
      <div className={hasBlocks ? 'px-4' : 'mt-14 px-4'}>
        {!typed && !inArtistView && search.error === null ? <HomeState /> : null}
        {showEmpty ? <NoResults query={query.trim()} /> : null}
        <SearchStatus
          typed={typed || inArtistView}
          loading={waitingForSongBook}
          error={error}
          retry={retry}
          announcement={announcement}
        />
      </div>
    </>
  );
}
