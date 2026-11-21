import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { buildArtists, type RawSong } from '../../scripts/import/artists.ts';
import { encodeDataset, parseDataset } from '../../src/lib/dataset.ts';

const RAW = 'data/work/songs.raw.json';
const present = existsSync(RAW);
if (!present) console.warn(`[skipped] ${RAW} not found: run \`npm run import\` to enable the real-data artist checks.`);

describe.skipIf(!present)('artists on the real import', () => {
  const rows = present ? (JSON.parse(readFileSync(RAW, 'utf8')) as RawSong[]) : [];
  const first = buildArtists(rows);
  const { songs, artists } = first.dataset;

  it('keeps every song, each listed under at least one artist', () => {
    expect(songs).toHaveLength(rows.length);
    expect(songs.every((s) => s.ar.length >= 1)).toBe(true);
  });
  it('has unique ids and every song reference resolves', () => {
    const ids = new Set(artists.map((a) => a.id));
    expect(ids.size).toBe(artists.length);
    expect(songs.every((s) => s.ar.every((id) => ids.has(id)))).toBe(true);
  });
  it('adds up: sum of counts = sum of song artist lists', () => {
    expect(artists.reduce((s, a) => s + a.count, 0)).toBe(songs.reduce((s, x) => s + x.ar.length, 0));
  });
  it('keeps the printed credit', () => {
    expect(songs.every((s, i) => s.a === (rows[i] as RawSong).a)).toBe(true);
  });
  it('is deterministic and round-trips through the shipped format', () => {
    const a = encodeDataset(first.dataset);
    expect(encodeDataset(buildArtists(rows).dataset)).toEqual(a);
    expect(parseDataset(a.songsJson, a.artistsJson)).toEqual(first.dataset);
  });
  it('stays under the 1.5 MB gzipped budget', async () => {
    const { gzipSync } = await import('node:zlib');
    const e = encodeDataset(first.dataset);
    expect(gzipSync(e.songsJson, { level: 9 }).length + gzipSync(e.artistsJson, { level: 9 }).length).toBeLessThan(1.5 * 1024 * 1024);
  });
});
