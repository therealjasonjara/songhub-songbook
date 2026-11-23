import type { SongHit } from '@/lib/search/types';

/** `1 song`, `128 songs`, `1,204 songs` (the count text of an artist row and of the artist heading). */
export function formatSongCount(count: number): string {
  return count === 1 ? '1 song' : `${count.toLocaleString('en-US')} songs`;
}

/** What a screen reader hears for an artist: `Eagles, 128 songs`. */
export function artistLabel(name: string, count: number): string {
  return `${name}, ${formatSongCount(count)}`;
}

export interface ArtistHeading {
  name: string;
  /** Every song the artist is listed under, featured credits included. */
  count: number;
}

/**
 * The heading of the artist view, read from the artist's own song list (no second lookup): the canonical name is
 * on every song that lists the artist. Null for an id nobody is listed under, so a made-up `?artist=` is ignored.
 */
export function artistHeading(songs: readonly SongHit[], artistId: string): ArtistHeading | null {
  const first = songs[0];
  if (first === undefined) return null;
  const ref = first.artists.find((artist) => artist.id === artistId);
  if (ref === undefined) return null;
  return { name: ref.name, count: songs.length };
}
