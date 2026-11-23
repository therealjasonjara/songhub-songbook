import { describe, expect, it } from 'vitest';
import { encodeDataset, parseDataset, type Dataset } from '../../src/lib/dataset.ts';
import { contentId } from '../../scripts/import/dataset-id.ts';

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

const encode = (d: Dataset) => encodeDataset(d, contentId);

describe('dataset format', () => {
  it('round-trips', () => {
    const { songsJson, artistsJson } = encode(ds);
    expect(parseDataset(songsJson, artistsJson)).toEqual(ds);
  });
  it('stores single-artist songs as a bare index, several as a list', () => {
    const { songsJson, artistsJson } = encode(ds);
    expect(JSON.parse(songsJson).ar).toEqual([0, [0, 1]]);
    expect(JSON.parse(artistsJson).artists[0]).toEqual(['a', 'A', ['a.'], 2]);
  });
  it('rejects an unknown artist id when encoding and a bad index when parsing', () => {
    expect(() => encode({ artists: [], songs: [{ n: 1, t: '', a: '', ar: ['zz'] }] })).toThrow(/unknown artist/);
    expect(() => parseDataset('{"v":2,"id":"x","n":[1],"t":["x"],"a":["y"],"ar":[5]}', '{"v":2,"id":"x","artists":[]}')).toThrow(/out of range/);
  });
});

describe('dataset id (stale-pair protection)', () => {
  it('writes v2 and the same 16-hex id into both files', () => {
    const { songsJson, artistsJson, id } = encode(ds);
    const s = JSON.parse(songsJson);
    const a = JSON.parse(artistsJson);
    expect(s.v).toBe(2);
    expect(a.v).toBe(2);
    expect(s.id).toBe(id);
    expect(a.id).toBe(id);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });
  it('is deterministic: encoding the same dataset twice is byte-identical', () => {
    const one = encode(ds);
    const two = encode(structuredClone(ds));
    expect(two.songsJson).toBe(one.songsJson);
    expect(two.artistsJson).toBe(one.artistsJson);
  });
  it('changes when either payload changes', () => {
    const base = encode(ds).id;
    expect(encode({ ...ds, songs: [{ n: 1, t: 'One!', a: 'A', ar: ['a'] }, ds.songs[1]!] }).id).not.toBe(base);
    expect(encode({ ...ds, artists: [{ ...ds.artists[0]!, count: 3 }, ds.artists[1]!] }).id).not.toBe(base);
  });
  it('rejects a pair whose ids differ', () => {
    const a = encode(ds);
    const other = encode({ ...ds, artists: [{ ...ds.artists[0]!, name: 'A2' }, ds.artists[1]!] });
    expect(() => parseDataset(a.songsJson, other.artistsJson)).toThrow(/different versions/);
  });
  it('rejects a same-length pair with the artists reordered (different import)', () => {
    const a = encode(ds);
    const reordered = encode({ ...ds, artists: [ds.artists[1]!, ds.artists[0]!] });
    expect(JSON.parse(reordered.artistsJson).artists).toHaveLength(2);
    expect(() => parseDataset(a.songsJson, reordered.artistsJson)).toThrow(/different versions/);
  });
  it('rejects a pair where the artists file has one extra entry', () => {
    const a = encode(ds);
    const longer = encode({ ...ds, artists: [...ds.artists, { id: 'c', name: 'C', aliases: [], count: 0 }] });
    expect(() => parseDataset(a.songsJson, longer.artistsJson)).toThrow(/different versions/);
  });
  it('rejects a file with a missing id, in either file', () => {
    const { songsJson, artistsJson } = encode(ds);
    const noId = (json: string) => {
      const o = JSON.parse(json);
      delete o.id;
      return JSON.stringify(o);
    };
    expect(() => parseDataset(noId(songsJson), artistsJson)).toThrow(/no id/);
    expect(() => parseDataset(songsJson, noId(artistsJson))).toThrow(/no id/);
    expect(() => parseDataset(songsJson.replace(/"id":"[0-9a-f]+"/, '"id":""'), artistsJson)).toThrow(/no id/);
  });
  it('rejects v1 files', () => {
    const v1Songs = '{"v":1,"n":[1],"t":["x"],"a":["y"],"ar":[0]}';
    const v1Artists = '{"v":1,"artists":[["a","A",[],1]]}';
    expect(() => parseDataset(v1Songs, v1Artists)).toThrow(/Unsupported dataset version/);
    const v2 = encode(ds);
    expect(() => parseDataset(v1Songs, v2.artistsJson)).toThrow(/Unsupported dataset version/);
    expect(() => parseDataset(v2.songsJson, v1Artists)).toThrow(/Unsupported dataset version/);
  });
});
