import { SectionLabel } from '@/components/section-label';
import { SongRow } from '@/components/song-row';
import type { SongHit } from '@/lib/search/types';

export interface ResultsListProps {
  songs: readonly SongHit[];
  /** More songs matched than are shown. */
  hasMore: boolean;
  /** Show the `SONGS` label: only when the `ARTISTS` section is above (component 5). */
  showLabel?: boolean;
}

/** Title results (up to 50 rows) and, when more matched, the 64px hint row (docs/SHARED_COMPONENTS.md, component 4). */
export function ResultsList({ songs, hasMore, showLabel = false }: ResultsListProps) {
  if (songs.length === 0) return null;
  return (
    <>
      {showLabel ? <SectionLabel>Songs</SectionLabel> : null}
      <ul aria-label="Song results" className="m-0 list-none p-0">
        {songs.map((song) => (
          <SongRow key={song.n} song={song} />
        ))}
      </ul>
      {hasMore ? (
        <p className="m-0 flex min-h-16 items-center justify-center px-4 py-3 text-center text-[14px] leading-5 text-text-muted">
          Showing the top 50 matches. Keep typing to narrow down.
        </p>
      ) : null}
    </>
  );
}
