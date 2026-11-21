import type { Ref } from 'react';
import { ChevronLeftIcon } from '@/components/icons';
import { SongRow } from '@/components/song-row';
import { artistLabel, formatSongCount, type ArtistHeading } from '@/lib/artist-view';
import type { SongHit } from '@/lib/search/types';

export interface ArtistViewProps {
  heading: ArtistHeading;
  /** The artist's full list, A-Z by title. */
  songs: readonly SongHit[];
  onBack: () => void;
  /** The heading block takes focus when the view opens, so a screen reader announces `<name>, N songs`. */
  headingRef?: Ref<HTMLDivElement>;
}

/**
 * The artist view under the pinned search box (docs/SHARED_COMPONENTS.md, component 6): an 80px heading block
 * (44x44 back chevron, name 24/30 700 up to 2 lines, `N songs`) over the artist's whole list. No hint row and no
 * section labels. The block is a minimum: it is 80px with a one-line name and grows for a two-line name or enlarged text.
 */
export function ArtistView({ heading, songs, onBack, headingRef }: ArtistViewProps) {
  return (
    <>
      <div
        ref={headingRef}
        role="group"
        aria-label={artistLabel(heading.name, heading.count)}
        tabIndex={-1}
        className="box-border flex min-h-[80px] items-center gap-2 border-b border-divider bg-bg py-3 pr-4 pl-1.5 outline-none"
      >
        <button
          type="button"
          aria-label="Back to results"
          onClick={onBack}
          className="flex size-11 shrink-0 items-center justify-center rounded-button text-text active:bg-surface-pressed focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
        >
          <ChevronLeftIcon size={24} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 line-clamp-2 text-[24px] leading-[30px] font-bold text-text [overflow-wrap:anywhere]">{heading.name}</h2>
          <p className="m-0 text-[14px] leading-5 font-normal text-text-secondary">{formatSongCount(heading.count)}</p>
        </div>
      </div>
      <ul aria-label={`Songs by ${heading.name}`} className="m-0 list-none p-0">
        {songs.map((song) => (
          <SongRow key={song.n} song={song} deferOffscreen />
        ))}
      </ul>
    </>
  );
}
