/**
 * Shipped dataset format (public/data/songs.json and artists.json) and its typed loader.
 * Pure: no Node APIs, so the browser and the build script share it.
 *
 * songs.json   {"v":2,"id":"<16 hex>","n":[...],"t":[...],"a":[...],"ar":[...]}   parallel (columnar) arrays, one slot per song.
 *              `ar[i]` is an index into the artists array: a bare number when the song has one artist,
 *              an array of numbers when it has more (main artist first, then featured artists).
 * artists.json {"v":2,"id":"<16 hex>","artists":[[id,name,aliases,count],...]}     ordered by count desc, then id.
 *
 * Both files carry the same `id`, a content hash of the two payloads computed by the build. The browser fetches
 * the files separately, so a CDN or cache can hand it files from two different imports; `parseDataset` refuses a
 * pair whose ids differ (and any v1 file, which has no id) instead of silently attributing songs to wrong artists.
 */
export interface Song {
  n: number;
  t: string;
  /** Artist credit exactly as printed. */
  a: string;
  /** Artist ids the song is listed under (main artist first, then featured). */
  ar: string[];
}

export interface Artist {
  id: string;
  name: string;
  aliases: string[];
  count: number;
}

export interface Dataset {
  songs: Song[];
  artists: Artist[];
}

export interface SongsFile {
  v: 2;
  id: string;
  n: number[];
  t: string[];
  a: string[];
  ar: (number | number[])[];
}

export interface ArtistsFile {
  v: 2;
  id: string;
  artists: [id: string, name: string, aliases: string[], count: number][];
}

/** Current file format version. */
export const DATASET_VERSION = 2;

/** Content hash of both payloads (without the id), as the shared `id`. Injected so this module stays free of Node APIs. */
export type DatasetIdFn = (songsPayload: string, artistsPayload: string) => string;

export function encodeDataset(ds: Dataset, makeId: DatasetIdFn): { songsJson: string; artistsJson: string; id: string } {
  const index = new Map<string, number>();
  ds.artists.forEach((a, i) => index.set(a.id, i));
  const songs = { n: [] as number[], t: [] as string[], a: [] as string[], ar: [] as (number | number[])[] };
  for (const s of ds.songs) {
    const idx = s.ar.map((id) => {
      const i = index.get(id);
      if (i === undefined) throw new Error(`Song ${s.n} references unknown artist id "${id}"`);
      return i;
    });
    songs.n.push(s.n);
    songs.t.push(s.t);
    songs.a.push(s.a);
    songs.ar.push(idx.length === 1 ? (idx[0] as number) : idx);
  }
  const artists = { artists: ds.artists.map((a) => [a.id, a.name, a.aliases, a.count]) };
  const id = makeId(JSON.stringify(songs), JSON.stringify(artists));
  const songsFile: SongsFile = { v: DATASET_VERSION, id, ...songs };
  const artistsFile: ArtistsFile = { v: DATASET_VERSION, id, ...(artists as Pick<ArtistsFile, 'artists'>) };
  return { songsJson: JSON.stringify(songsFile), artistsJson: JSON.stringify(artistsFile), id };
}

function header(file: unknown, name: string): { v: unknown; id: unknown } {
  if (typeof file !== 'object' || file === null) throw new Error(`${name} is not a dataset file.`);
  return file as { v: unknown; id: unknown };
}

export function parseDataset(songsJson: string, artistsJson: string): Dataset {
  const sf = JSON.parse(songsJson) as SongsFile;
  const af = JSON.parse(artistsJson) as ArtistsFile;
  const sh = header(sf, 'songs.json');
  const ah = header(af, 'artists.json');
  if (sh.v !== DATASET_VERSION || ah.v !== DATASET_VERSION) {
    throw new Error('Unsupported dataset version (expected v2); the data files are out of date or mixed.');
  }
  if (typeof sh.id !== 'string' || sh.id === '' || typeof ah.id !== 'string' || ah.id === '') {
    throw new Error('The dataset files carry no id.');
  }
  if (sh.id !== ah.id) {
    throw new Error('The song and artist files come from different versions of the song book.');
  }
  const artists: Artist[] = af.artists.map(([id, name, aliases, count]) => ({ id, name, aliases, count }));
  const songs: Song[] = sf.n.map((n, i) => {
    const raw = sf.ar[i] as number | number[];
    const list = Array.isArray(raw) ? raw : [raw];
    return {
      n,
      t: sf.t[i] as string,
      a: sf.a[i] as string,
      ar: list.map((j) => {
        const art = artists[j];
        if (!art) throw new Error(`Song ${n} references artist index ${j} out of range`);
        return art.id;
      }),
    };
  });
  return { songs, artists };
}
