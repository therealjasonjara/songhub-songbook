import { memo } from 'react';
import type { SongHit } from '@/lib/search/types';

export interface SongRowProps {
  song: SongHit;
}

/**
 * Rows are compared by what they draw. Every worker reply is a structured clone, so the same song arrives as a new
 * object each time; comparing the object would re-render all 50 rows on every answer.
 */
export function sameRow(previous: SongRowProps, next: SongRowProps): boolean {
  return previous.song.n === next.song.n && previous.song.title === next.song.title && previous.song.credit === next.song.credit;
}

/** The sentence a screen reader reads for a row: number first, then title, then the credit as printed. */
export function songRowLabel(song: SongHit): string {
  return song.credit === '' ? `Song ${song.n}, ${song.title}` : `Song ${song.n}, ${song.title} by ${song.credit}`;
}

/**
 * One title result (docs/SHARED_COMPONENTS.md, component 3): 88px tall, number column 136px, no tap action. Both are
 * minimums: exactly 88px and 136px at normal text size, and they grow only when the guest has enlarged their text
 * (A-011), so the number never draws over the title.
 * A list item, not a control: no tabindex, no handler. The visible text is hidden from assistive technology and a
 * single visually-hidden sentence is read instead, so the number comes first.
 */
export const SongRow = memo(function SongRow({ song }: SongRowProps) {
  return (
    <li className="box-border flex min-h-[88px] w-full items-center gap-3 border-b border-divider px-4 py-2 select-none active:bg-surface-pressed">
      <span className="sr-only">{songRowLabel(song)}</span>
      <span
        aria-hidden="true"
        className="w-auto min-w-[136px] shrink-0 text-left text-[36px] leading-10 font-extrabold tracking-[-0.01em] whitespace-nowrap text-accent tabular-nums"
      >
        {song.n}
      </span>
      <span aria-hidden="true" className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="line-clamp-2 text-[17px] leading-[22px] font-semibold text-text [overflow-wrap:anywhere]">{song.title}</span>
        {song.credit !== '' ? (
          <span className="mt-0.5 truncate text-[14px] leading-5 font-normal text-text-secondary">{song.credit}</span>
        ) : null}
      </span>
    </li>
  );
}, sameRow);
