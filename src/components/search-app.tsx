'use client';

import { MusicNoteIcon } from '@/components/icons';
import { SearchBox } from '@/components/search-box';
import { useQueryParam } from '@/hooks/use-query-param';
import { useSearch } from '@/hooks/use-search';

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
}

/**
 * The area under the search box for the loading and error states. T007 and T008 render the result rows here.
 * The live region is always in the page, so a screen reader announces what appears in it.
 */
export function SearchStatus({ typed, loading, error, retry }: SearchStatusProps) {
  return (
    <>
      <div role="status" aria-live="polite" className="text-center text-base leading-6 text-text-secondary">
        {typed && loading && error === null ? 'Loading song book…' : null}
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
 * `useSearch` and rendered by T007/T008.
 */
export function SearchApp() {
  const [query, setQuery] = useQueryParam();
  const search = useSearch(query);
  const typed = query.trim() !== '';
  // Not-loading means the dataset is ready or has failed; the hook's `loading` also covers "waiting for the reply".
  const waitingForSongBook = search.status === 'loading';

  return (
    <>
      <SearchBox value={query} onChange={setQuery} />
      {/* 56px here + the box's 8px bottom padding = 64px below the field */}
      <div className="mt-14 px-4">
        {!typed && search.error === null ? <HomeState /> : null}
        <SearchStatus typed={typed} loading={waitingForSongBook} error={search.error} retry={search.retry} />
      </div>
    </>
  );
}
