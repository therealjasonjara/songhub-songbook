import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseDataset, type Dataset } from '../../src/lib/dataset.ts';
import { normalize } from '../../src/lib/normalize.ts';
import { splitForm } from '../../src/lib/search/build.ts';
import { buildIndex, searchSongs, songsByArtist, suggestArtists } from '../../src/lib/search/index.ts';

const SONGS = 'public/data/songs.json';
const ARTISTS = 'public/data/artists.json';
const present = existsSync(SONGS) && existsSync(ARTISTS);
if (!present) console.warn(`[skipped] ${SONGS} / ${ARTISTS} not found: run \`npm run build:data\` to enable the real-data search checks.`);

describe.skipIf(!present)('search on the real dataset', () => {
  const ds: Dataset = present ? parseDataset(readFileSync(SONGS, 'utf8'), readFileSync(ARTISTS, 'utf8')) : { songs: [], artists: [] };
  const index = present ? buildIndex(ds) : (undefined as never);
  const top = (q: string) => searchSongs(index, q).results;

  it('has a realistic size', () => {
    expect(ds.songs.length).toBeGreaterThan(5000);
  });

  it('"hotel californa" ranks the dataset\'s Hotel California by Eagles first', () => {
    const wanted = new Set(ds.songs.filter((s) => normalize(s.t) === 'hotel california' && normalize(s.a) === 'eagles').map((s) => s.n));
    expect(wanted.size).toBeGreaterThan(0);
    const [first] = top('hotel californa');
    expect(first && wanted.has(first.n)).toBe(true);
    expect(first?.artists.map((a) => a.name)).toContain('Eagles');
  });

  it('"di ka na others" finds \'Di Ka Na Others', () => {
    expect(top('di ka na others')[0]?.title).toBe("'Di Ka Na Others");
  });

  it('"ive had the time" finds (I\'ve Had) the Time of My Life', () => {
    const titles = top('ive had the time').map((h) => normalize(h.title));
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.every((t) => t.includes('ive had the time'))).toBe(true);
    expect(top('ive had the time').some((h) => h.title === "(I've Had) the Time of My Life")).toBe(true);
  });

  it('puts an exact whole-title match first and keeps the tier order for "yesterday"', () => {
    const results = top('yesterday');
    const tiers = results.map((h) => {
      const t = normalize(h.title);
      return t === 'yesterday' ? 0 : t.startsWith('yesterday ') ? 1 : t.startsWith('yesterday') ? 2 : 3;
    });
    expect(tiers[0]).toBe(0);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
  });

  it('suggests the Eagles first for "eagles", with the dataset count', () => {
    const eagles = ds.artists.find((a) => a.id === 'eagles');
    expect(eagles).toBeDefined();
    const [first] = suggestArtists(index, 'eagles');
    expect(first).toEqual({ id: 'eagles', name: 'Eagles', count: eagles?.count });
    expect(suggestArtists(index, 'eagles').length).toBeLessThanOrEqual(3);
  });

  it('"taylor swift" list size equals the artist count, A-Z by title', () => {
    const artist = ds.artists.find((a) => a.id === 'taylor-swift');
    expect(artist).toBeDefined();
    const songs = songsByArtist(index, 'taylor-swift');
    expect(songs).toHaveLength(artist?.count ?? -1);
    const keys = songs.map((s) => [normalize(s.title), s.n] as const);
    const sorted = [...keys].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
    expect(keys).toEqual(sorted);
    expect(suggestArtists(index, 'taylor swift')[0]?.id).toBe('taylor-swift');
    expect(suggestArtists(index, 'tailor swift')[0]?.id).toBe('taylor-swift');
  });

  it('every artist\'s own list matches its count (the list is never capped)', () => {
    for (const a of ds.artists.slice(0, 25)) expect(songsByArtist(index, a.id)).toHaveLength(a.count);
  });

  it('reports the full total for a common word and caps the rows at 50', () => {
    const r = searchSongs(index, 'love');
    expect(r.results).toHaveLength(50);
    expect(r.total).toBeGreaterThan(500);
    expect(r.hasMore).toBe(true);
    const direct = ds.songs.filter((s) => normalize(s.t).split(' ').some((w) => w.startsWith('love'))).length;
    expect(r.total).toBeGreaterThanOrEqual(direct);
  });

  it('answers one-character and punctuation-only queries without scanning the world', () => {
    const one = searchSongs(index, 'a');
    expect(one.results).toHaveLength(50);
    expect(one.hasMore).toBe(true);
    expect(searchSongs(index, '!!!')).toEqual({ results: [], total: 0, hasMore: false });
    expect(searchSongs(index, '')).toEqual({ results: [], total: 0, hasMore: false });
  });

  it('a word that only appears mid-name suggests no artist', () => {
    const midOnly = ds.artists.find((a) => normalize(a.name).split(' ').length > 1 && normalize(a.name).split(' ').slice(1).some((w) => w.length >= 5));
    expect(midOnly).toBeDefined();
    const word = normalize(midOnly?.name ?? '').split(' ').slice(1).find((w) => w.length >= 5) ?? '';
    const startsWithIt = ds.artists.some((a) => normalize(a.name).startsWith(word));
    if (!startsWithIt) expect(suggestArtists(index, word).some((s) => s.id === midOnly?.id)).toBe(false);
  });

  it('shows the same results for typed variants of one query', () => {
    const base = top("don't stop believin").map((h) => h.n);
    expect(base.length).toBeGreaterThan(0);
    expect(top('DONT STOP BELIEVIN').map((h) => h.n)).toEqual(base);
    expect(top('dont  stop, believin!').map((h) => h.n)).toEqual(base);
  });

  it('is deterministic', () => {
    for (const q of ['love', 'the', 'hotel californa', 'ben and ben']) expect(searchSongs(index, q)).toEqual(searchSongs(index, q));
  });

  it('every title with a dotted word is found by its words (top 50), and its initialisms stay joined', () => {
    const dotted = ds.songs.filter((s) => splitForm(s.t) !== undefined);
    expect(dotted.length).toBeGreaterThan(50);
    const missing = dotted.filter((s) => !top(splitForm(s.t) as string).some((h) => h.n === s.n)).map((s) => `${s.n} ${s.t}`);
    expect(missing).toEqual([]);
    const joined = dotted.filter((s) => !top(normalize(s.t)).some((h) => h.n === s.n)).map((s) => `${s.n} ${s.t}`);
    expect(joined).toEqual([]);
  }, 30_000);
});
