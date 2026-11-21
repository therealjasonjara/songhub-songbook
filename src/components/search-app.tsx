'use client';

import { useEffect } from 'react';
import { MusicNoteIcon } from '@/components/icons';
import { NoResults } from '@/components/no-results';
import { ResultsList } from '@/components/results-list';
import { SearchBox } from '@/components/search-box';
import { useQueryParam } from '@/hooks/use-query-param';
import { useSearch } from '@/hooks/use-search';
import { useSettledValue } from '@/hooks/use-settled-value';
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
 * The search screen under the header. The text is in the address bar (`?q=`); results are produced by
 * `useSearch`. Exactly one of these shows under the box: home, loading line, error, results, no results.
 */
export function SearchApp() {
  const [query, setQuery] = useQueryParam();
  const search = useSearch(query);
  // Whitespace- or punctuation-only input has nothing to search for: it is the home state again.
  const typed = hasSearchableText(query, normalize);
  // Not-loading means the dataset is ready or has failed; the hook's `loading` also covers "waiting for the reply".
  const waitingForSongBook = search.status === 'loading';
  const ready = search.status === 'ready' && search.error === null;
  // Only an answered query may say "No songs found"; while the next answer is in flight the previous rows stay.
  const answered = typed && ready && !search.loading;
  const showList = typed && ready && search.songs.length > 0;
  const showEmpty = answered && search.total === 0;
  const announcement = useSettledValue(answered ? resultAnnouncement(search.total) : null, ANNOUNCE_DELAY_MS);

  // A new query starts at the top: results scroll under the sticky strip.
  useEffect(() => {
    const scroller = document.scrollingElement;
    if (scroller) scroller.scrollTop = 0;
  }, [query]);

  return (
    <>
      <SearchBox value={query} onChange={setQuery} />
      {showList ? <ResultsList songs={search.songs} hasMore={search.hasMore} /> : null}
      {/* 56px here + the box's 8px bottom padding = 64px below the field */}
      <div className={showList ? 'px-4' : 'mt-14 px-4'}>
        {!typed && search.error === null ? <HomeState /> : null}
        {showEmpty ? <NoResults query={query.trim()} /> : null}
        <SearchStatus
          typed={typed}
          loading={waitingForSongBook}
          error={search.error}
          retry={search.retry}
          announcement={announcement}
        />
      </div>
    </>
  );
}
