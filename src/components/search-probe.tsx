'use client';

import { useState } from 'react';
import { useSearch } from '@/hooks/use-search';

/**
 * Placeholder that proves the search service works end to end (T005). Unstyled on purpose:
 * the real header, search field and rows are T006-T008 and replace this component.
 */
export function SearchProbe() {
  const [query, setQuery] = useState('');
  const { status, songs, total, loading, error, retry } = useSearch(query);
  const typed = query.trim() !== '';

  return (
    <section aria-label="Search check" className="mt-8 w-full text-left">
      <label htmlFor="search-probe-input" className="block text-sm">
        Search songs
      </label>
      <input
        id="search-probe-input"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="mt-1 w-full rounded border border-current px-3 py-2"
      />
      <div role="status" aria-live="polite" className="mt-2 text-sm">
        {status === 'loading' && typed ? 'Loading song book…' : null}
        {status === 'ready' && typed && !loading ? `${total} results` : null}
      </div>
      {error ? (
        <div role="alert" className="mt-2 text-sm">
          <p>{error}</p>
          <button type="button" onClick={retry} className="mt-2 rounded border border-current px-3 py-2">
            Try again
          </button>
        </div>
      ) : null}
      {status === 'ready' && typed && !loading ? (
        <ol className="mt-2 text-sm" data-testid="probe-numbers">
          {songs.slice(0, 5).map((song) => (
            <li key={song.n}>
              {song.n} {song.title}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
