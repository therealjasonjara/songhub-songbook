import { readFileSync } from 'node:fs';

/**
 * Facts read from the shipped dataset itself, so the tests never hard-code a count or a number.
 * (The song book contains profanity: the tests use numbers and counts, and never print titles.)
 */
interface SongsFile {
  n: number[];
  t: string[];
  a: string[];
}
interface ArtistsFile {
  /** [id, name, aliases, count] per artist. */
  artists: [string, string, string[], number][];
}

const songs = JSON.parse(readFileSync('public/data/songs.json', 'utf8')) as SongsFile;
const artistFile = JSON.parse(readFileSync('public/data/artists.json', 'utf8')) as ArtistsFile;

export const SONG_COUNT = songs.n.length;

/** The song number of "Hotel California" by Eagles. */
const hotelIndex = songs.t.findIndex((title, i) => title === 'Hotel California' && songs.a[i] === 'Eagles');
if (hotelIndex < 0) throw new Error('the dataset should hold Hotel California by Eagles');
export const HOTEL_NUMBER = songs.n[hotelIndex] as number;

export interface ArtistFact {
  id: string;
  name: string;
  count: number;
}
const byId = new Map<string, ArtistFact>(artistFile.artists.map(([id, name, , count]) => [id, { id, name, count }]));

export function artistFact(id: string): ArtistFact {
  const found = byId.get(id);
  if (!found) throw new Error(`artist ${id} is not in the dataset`);
  return found;
}

export const countText = (n: number): string => (n === 1 ? '1 song' : `${n.toLocaleString('en-US')} songs`);
export const artistLabel = (a: ArtistFact): string => `${a.name}, ${countText(a.count)}`;
