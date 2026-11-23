'use client';

import { useRef } from 'react';
import { CloseIcon, SearchIcon } from '@/components/icons';

/** The id of the search field: the artist view hands focus back to it. */
export const SEARCH_INPUT_ID = 'search-input';

export interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Sticky 72px strip with the 56px search field (docs/SHARED_COMPONENTS.md, component 2).
 * The border is an overlay (1px idle, 2px accent on focus) so the text never moves when focus changes.
 */
export function SearchBox({ value, onChange }: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function clear() {
    onChange('');
    inputRef.current?.focus();
  }

  return (
    <div role="search" className="sticky top-0 z-10 h-[72px] bg-bg px-4 py-2">
      <div className="relative h-14 rounded-input bg-input-bg">
        <label htmlFor={SEARCH_INPUT_ID} className="sr-only">
          Search song or artist
        </label>
        <SearchIcon size={24} className="pointer-events-none absolute top-4 left-4 text-text-muted" />
        <input
          ref={inputRef}
          id={SEARCH_INPUT_ID}
          name="q"
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search song or artist"
          autoFocus
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          className="peer h-full w-full rounded-input bg-transparent pr-[52px] pl-[52px] text-[18px] leading-6 font-normal text-text outline-none placeholder:text-text-muted"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-input border border-input-border peer-focus:border-2 peer-focus:border-input-border-focus"
        />
        {value !== '' ? (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(event) => event.preventDefault()}
            onClick={clear}
            className="absolute top-1 right-1 flex size-12 items-center justify-center rounded-button text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          >
            <CloseIcon size={20} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
