/**
 * Shipped dataset format (public/data/songs.json and artists.json) and its typed loader.
 * Pure: no Node APIs, so the browser and the build script share it.
 *
 * songs.json   {"v":1,"n":[...],"t":[...],"a":[...],"ar":[...]}   parallel (columnar) arrays, one slot per song.
 *              `ar[i]` is an index into the artists array: a bare number when the song has one artist,
 *              an array of numbers when it has more (main artist first, then featured artists).
 * artists.json {"v":1,"artists":[[id,name,aliases,count],...]}     ordered by count desc, then id.
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
  v: 1;
  n: number[];
  t: string[];
  a: string[];
  ar: (number | number[])[];
}

export interface ArtistsFile {
  v: 1;
  artists: [id: string, name: string, aliases: string[], count: number][];
}

export function encodeDataset(ds: Dataset): { songsJson: string; artistsJson: string } {
  const index = new Map<string, number>();
  ds.artists.forEach((a, i) => index.set(a.id, i));
  const songs: SongsFile = { v: 1, n: [], t: [], a: [], ar: [] };
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
  const artists: ArtistsFile = {
    v: 1,
    artists: ds.artists.map((a) => [a.id, a.name, a.aliases, a.count]),
  };
  return { songsJson: JSON.stringify(songs), artistsJson: JSON.stringify(artists) };
}

export function parseDataset(songsJson: string, artistsJson: string): Dataset {
  const sf = JSON.parse(songsJson) as SongsFile;
  const af = JSON.parse(artistsJson) as ArtistsFile;
  if (sf.v !== 1 || af.v !== 1) throw new Error('Unsupported dataset version');
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
