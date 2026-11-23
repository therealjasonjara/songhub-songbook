'use client';

import type { MouseEvent } from 'react';
import { ChevronRightIcon } from '@/components/icons';
import { SectionLabel } from '@/components/section-label';
import { artistLabel, formatSongCount } from '@/lib/artist-view';
import { buildSearch } from '@/lib/query-url';
import type { ArtistSuggestion } from '@/lib/search/types';

export interface ArtistMatchesProps {
  /** The text in the search box: it goes into each link (`?q=<query>&artist=<id>`). */
  query: string;
  /** Up to 3 strongly matching artists, already chosen by the engine. */
  artists: readonly ArtistSuggestion[];
  onOpen: (artistId: string) => void;
}

/** A plain click opens the artist in the app; a modified click or a middle click keeps its browser meaning (new tab, new window). */
function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.defaultPrevented;
}

/**
 * The `ARTISTS` section above the song results (docs/SHARED_COMPONENTS.md, component 5): 64px rows, the whole row is
 * the tap target. The link's name is one visually-hidden sentence, `<name>, N songs`, like the song rows (the drawn text is
 * hidden from assistive technology; no aria-label, so there is nothing to disagree with what is drawn). Each row is a real link, so it works with a new tab and long-press; a plain click is taken over
 * to open the artist without a page load.
 */
export function ArtistMatches({ query, artists, onOpen }: ArtistMatchesProps) {
  if (artists.length === 0) return null;
  return (
    <section aria-label="Artists">
      <SectionLabel>Artists</SectionLabel>
      <ul className="m-0 list-none p-0">
        {artists.map((artist) => (
          <li key={artist.id} className="border-b border-divider">
            <a
              href={buildSearch(query, artist.id)}
              onClick={(event) => {
                if (!isPlainClick(event)) return;
                event.preventDefault();
                onOpen(artist.id);
              }}
              className="box-border flex h-16 items-center gap-2 px-4 text-text no-underline select-none active:bg-surface-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <span className="sr-only">{artistLabel(artist.name, artist.count)}</span>
              <span aria-hidden="true" className="min-w-0 flex-1 truncate text-[17px] leading-[22px] font-semibold">
                {artist.name}
              </span>
              <span aria-hidden="true" className="shrink-0 text-[14px] leading-5 font-normal whitespace-nowrap text-text-secondary">
                {formatSongCount(artist.count)}
              </span>
              <ChevronRightIcon size={20} className="shrink-0 text-text-muted" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
