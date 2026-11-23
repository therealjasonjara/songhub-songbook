import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { encodeDataset, parseDataset } from '../../src/lib/dataset';
import { contentId } from '../../scripts/import/dataset-id';
import { buildIndex, buildIndexAsync, createEngineRunner, searchSongs, type EngineResponse } from '../../src/lib/search';

const songsJson = readFileSync('public/data/songs.json', 'utf8');
const artistsJson = readFileSync('public/data/artists.json', 'utf8');

/** The same handlers the Web Worker runs, driven in Node against the real shipped files (no worker, no DOM). */
function runner(load?: (fresh: boolean) => Promise<{ songsJson: string; artistsJson: string }>) {
  const out: EngineResponse[] = [];
  const waiters: Array<() => void> = [];
  const r = createEngineRunner({
    load: load ?? (async () => ({ songsJson, artistsJson })),
    post: (response) => {
      out.push(response);
      waiters.splice(0).forEach((w) => w());
    },
  });
  const next = async (predicate: (r: EngineResponse) => boolean) => {
    for (;;) {
      const hit = out.find(predicate);
      if (hit) return hit;
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
  };
  return { r, out, next };
}

describe('engine runner on the real dataset', () => {
  it('loads, builds, answers ready, then answers each query with its requestId', async () => {
    const { r, out, next } = runner();
    r.handle({ type: 'init', fresh: false });
    await next((x) => x.type === 'ready');

    r.handle({ type: 'search', requestId: 41, query: 'hotel californa' });
    const search = (await next((x) => x.type === 'search' && x.requestId === 41)) as Extract<EngineResponse, { type: 'search' }>;
    expect(search.result.total).toBeGreaterThan(0);
    expect(search.result.results[0]?.title.toLowerCase()).toContain('hotel california');
    expect(search.result.results.length).toBeLessThanOrEqual(50);

    r.handle({ type: 'suggestArtists', requestId: 42, query: 'eagle' });
    const sug = (await next((x) => x.type === 'suggestArtists' && x.requestId === 42)) as Extract<EngineResponse, { type: 'suggestArtists' }>;
    expect(sug.artists.map((a) => a.name)).toContain('Eagles');

    r.handle({ type: 'songsByArtist', requestId: 43, artistId: sug.artists.find((a) => a.name === 'Eagles')?.id ?? '' });
    const by = (await next((x) => x.type === 'songsByArtist' && x.requestId === 43)) as Extract<EngineResponse, { type: 'songsByArtist' }>;
    expect(by.songs.length).toBe(sug.artists.find((a) => a.name === 'Eagles')?.count);

    expect(out.filter((x) => x.type === 'error')).toEqual([]);
  }, 30_000);

  it('answers a query that arrives before the index exists with an error tagged by its requestId', () => {
    const { r, out } = runner();
    r.handle({ type: 'search', requestId: 7, query: 'x' });
    expect(out).toEqual([{ type: 'error', requestId: 7, message: 'The song book is not loaded yet.' }]);
  });

  it('reports a failed load as an error without a requestId (this is what shows the retry message)', async () => {
    const { r, next } = runner(async () => {
      throw new Error('/data/songs.json: HTTP 503');
    });
    r.handle({ type: 'init', fresh: false });
    const err = (await next((x) => x.type === 'error')) as Extract<EngineResponse, { type: 'error' }>;
    expect(err.requestId).toBeUndefined();
    expect(err.message).toBe('/data/songs.json: HTTP 503');
  });

  it('reports a mismatched pair of files (different dataset ids) as a load error', async () => {
    const stale = JSON.stringify({ v: 2, id: '0000000000000000', artists: [] });
    const { r, next } = runner(async () => ({ songsJson, artistsJson: stale }));
    r.handle({ type: 'init', fresh: false });
    const err = (await next((x) => x.type === 'error')) as Extract<EngineResponse, { type: 'error' }>;
    expect(err.requestId).toBeUndefined();
    expect(err.message).toMatch(/different versions/);
  });

  it('a second init supersedes the first: only the latest load can answer ready', async () => {
    let calls = 0;
    const gates: Array<() => void> = [];
    const { r, out, next } = runner(
      () =>
        new Promise((resolve) => {
          const n = ++calls;
          gates.push(() => resolve({ songsJson, artistsJson: n === 1 ? '{"v":2,"id":"0000000000000000","artists":[]}' : artistsJson }));
        }),
    );
    r.handle({ type: 'init', fresh: false });
    r.handle({ type: 'init', fresh: true });
    gates[0]?.(); // the first (bad) load finishes late
    gates[1]?.();
    await next((x) => x.type === 'ready');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(out.map((x) => x.type)).toEqual(['ready']);
  }, 30_000);
});

describe('engine runner: init ordering and cache bypass', () => {
  const tiny = (title: string) =>
    encodeDataset({ artists: [{ id: 'x', name: 'X', aliases: [], count: 1 }], songs: [{ n: 1, t: title, a: 'X', ar: ['x'] }] }, contentId);

  it('a first load that is good but late does not overwrite a newer init (the READY path guard)', async () => {
    const gates: Array<() => void> = [];
    const texts = [tiny('Alpha'), tiny('Beta')];
    let calls = 0;
    const { r, out, next } = runner(
      () =>
        new Promise((resolve) => {
          const mine = texts[calls++] as ReturnType<typeof tiny>;
          gates.push(() => resolve({ songsJson: mine.songsJson, artistsJson: mine.artistsJson }));
        }),
    );
    r.handle({ type: 'init', fresh: false });
    r.handle({ type: 'init', fresh: true });
    gates[1]?.(); // the newer load (Beta) finishes first
    await next((x) => x.type === 'ready');
    gates[0]?.(); // the older load (Alpha) is good, but late
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(out.map((x) => x.type)).toEqual(['ready']);
    r.handle({ type: 'search', requestId: 1, query: 'alpha' });
    r.handle({ type: 'search', requestId: 2, query: 'beta' });
    const totals = out.filter((x): x is Extract<EngineResponse, { type: 'search' }> => x.type === 'search').map((x) => x.result.total);
    expect(totals).toEqual([0, 1]);
  });

  it('passes `fresh` from init to the loader, so a retry can bypass the cache', async () => {
    const seen: boolean[] = [];
    const { r, next } = runner(async (fresh) => {
      seen.push(fresh);
      const t = tiny('Alpha');
      return { songsJson: t.songsJson, artistsJson: t.artistsJson };
    });
    r.handle({ type: 'init', fresh: false });
    await next((x) => x.type === 'ready');
    r.handle({ type: 'init', fresh: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen).toEqual([false, true]);
  });
});

describe('chunked build (the main-thread fallback)', () => {
  it('produces an index that answers exactly like the synchronous build', async () => {
    const ds = parseDataset(songsJson, artistsJson);
    const sync = buildIndex(ds);
    const chunked = await buildIndexAsync(ds, 5000);
    for (const q of ['hotel californa', 'yesterday', 'mr brightside', 'a', 'the', 'eagles', 'love']) {
      expect(searchSongs(chunked, q)).toEqual(searchSongs(sync, q));
    }
  }, 30_000);
});
