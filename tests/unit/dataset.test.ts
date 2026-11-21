import { describe, expect, it } from 'vitest';
import { encodeDataset, parseDataset, type Dataset } from '../../src/lib/dataset.ts';

const ds: Dataset = {
  artists: [
    { id: 'a', name: 'A', aliases: ['a.'], count: 2 },
    { id: 'b', name: 'B "x"', aliases: [], count: 1 },
  ],
  songs: [
    { n: 1, t: 'One', a: 'A', ar: ['a'] },
    { n: 2, t: 'Two', a: 'A ft. B "x"', ar: ['a', 'b'] },
  ],
};

describe('dataset format', () => {
  it('round-trips', () => {
    const { songsJson, artistsJson } = encodeDataset(ds);
    expect(parseDataset(songsJson, artistsJson)).toEqual(ds);
  });
  it('stores single-artist songs as a bare index, several as a list', () => {
    const { songsJson, artistsJson } = encodeDataset(ds);
    expect(JSON.parse(songsJson).ar).toEqual([0, [0, 1]]);
    expect(JSON.parse(artistsJson).artists[0]).toEqual(['a', 'A', ['a.'], 2]);
  });
  it('rejects an unknown artist id when encoding and a bad index when parsing', () => {
    expect(() => encodeDataset({ artists: [], songs: [{ n: 1, t: '', a: '', ar: ['zz'] }] })).toThrow(/unknown artist/);
    expect(() => parseDataset('{"v":1,"n":[1],"t":["x"],"a":["y"],"ar":[5]}', '{"v":1,"artists":[]}')).toThrow(/out of range/);
  });
});
