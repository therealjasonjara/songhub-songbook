// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseSearchResult } from '../../src/hooks/use-search';
import type { EngineRequest } from '../../src/lib/search/protocol';
import type { SongSearchResult } from '../../src/lib/search/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A stand-in for the browser Worker: the test is the far end of the wire. */
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: unknown = null;
  onmessageerror: unknown = null;
  posted: EngineRequest[] = [];
  terminated = false;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(message: EngineRequest): void {
    this.posted.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  say(data: unknown): void {
    this.onmessage?.({ data });
  }
  asked(type: 'search' | 'suggestArtists'): Extract<EngineRequest, { requestId: number }>[] {
    return this.posted.filter((p): p is Extract<EngineRequest, { requestId: number }> => p.type === type);
  }
}

const found = (n: number): SongSearchResult => ({ results: [{ n, title: `t${n}`, credit: 'c', artists: [] }], total: 1, hasMore: false });

let root: Root;
let latest: UseSearchResult;
let useSearch: (query: string) => UseSearchResult;

// One component type for the whole test, so the hook keeps its state when the query changes.
function Probe({ q, report }: { q: string; report: (result: UseSearchResult) => void }) {
  report(useSearch(q));
  return null;
}
const keep = (result: UseSearchResult): void => {
  latest = result;
};

function mount(query: string): Promise<void> {
  return act(async () => {
    root.render(createElement(Probe, { q: query, report: keep }));
  });
}

beforeEach(async () => {
  FakeWorker.all = [];
  vi.resetModules(); // a fresh shared client per test
  vi.stubGlobal('Worker', FakeWorker);
  ({ useSearch } = await import('../../src/hooks/use-search'));
  root = createRoot(document.createElement('div'));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe('useSearch', () => {
  it('retry after a load error bumps the attempt: a fresh worker loads with cache bypass and the query is asked again', async () => {
    await mount('abc');
    const first = FakeWorker.all[0] as FakeWorker;
    await act(async () => first.say({ type: 'ready' }));
    await act(async () => first.say({ type: 'error', message: 'worker died' }));
    expect(latest.status).toBe('error');
    expect(latest.error).toMatch(/Couldn't load/);
    expect(latest.loading).toBe(false);

    await act(async () => latest.retry());
    const second = FakeWorker.all[1] as FakeWorker;
    expect(FakeWorker.all).toHaveLength(2);
    expect(second.posted[0]).toEqual({ type: 'init', fresh: true });
    expect(latest.status).toBe('loading');
    expect(latest.error).toBeNull();

    await act(async () => second.say({ type: 'ready' }));
    const search = second.asked('search');
    expect(search.map((s) => (s as { query?: string }).query)).toEqual(['abc']); // asked again, exactly once
    await act(async () => {
      second.say({ type: 'search', requestId: (search[0] as { requestId: number }).requestId, result: found(1) });
      second.say({ type: 'suggestArtists', requestId: (second.asked('suggestArtists')[0] as { requestId: number }).requestId, artists: [] });
    });
    expect(latest.songs.map((s) => s.n)).toEqual([1]);
    expect(latest.loading).toBe(false);
  });

  it('surfaces a per-request error instead of staying loading, and retry asks the same query again', async () => {
    await mount('abc');
    const w = FakeWorker.all[0] as FakeWorker;
    await act(async () => w.say({ type: 'ready' }));
    expect(latest.loading).toBe(true);
    const id = (w.asked('search')[0] as { requestId: number }).requestId;
    await act(async () => w.say({ type: 'error', requestId: id, message: 'boom' }));
    expect(latest.status).toBe('ready');
    expect(latest.loading).toBe(false);
    expect(latest.error).toBe('That search failed. Try again.');

    await act(async () => latest.retry());
    expect(FakeWorker.all).toHaveLength(1); // the song book is fine: no new worker
    expect(latest.error).toBeNull();
    expect(latest.loading).toBe(true);
    expect(w.asked('search')).toHaveLength(2);
    await act(async () => {
      w.say({ type: 'search', requestId: (w.asked('search')[1] as { requestId: number }).requestId, result: found(7) });
      w.say({ type: 'suggestArtists', requestId: (w.asked('suggestArtists')[1] as { requestId: number }).requestId, artists: [] });
    });
    expect(latest.songs.map((s) => s.n)).toEqual([7]);
    expect(latest.error).toBeNull();
  });

  it('a new query clears the per-request error', async () => {
    await mount('abc');
    const w = FakeWorker.all[0] as FakeWorker;
    await act(async () => w.say({ type: 'ready' }));
    await act(async () => w.say({ type: 'error', requestId: (w.asked('search')[0] as { requestId: number }).requestId, message: 'boom' }));
    expect(latest.error).not.toBeNull();
    await mount('abcd');
    expect(latest.error).toBeNull();
    expect(latest.loading).toBe(true);
  });

  it('clearing the box forgets the old answer: typing again never shows the old query\'s rows', async () => {
    await mount('hotel');
    const w = FakeWorker.all[0] as FakeWorker;
    await act(async () => w.say({ type: 'ready' }));
    await act(async () => {
      w.say({ type: 'search', requestId: (w.asked('search')[0] as { requestId: number }).requestId, result: found(1) });
      w.say({ type: 'suggestArtists', requestId: (w.asked('suggestArtists')[0] as { requestId: number }).requestId, artists: [] });
    });
    expect(latest.songs.map((s) => s.n)).toEqual([1]);

    // Typing on from an answered query keeps the rows until the new answer (no flash).
    await mount('hotels');
    expect(latest.songs.map((s) => s.n)).toEqual([1]);
    expect(latest.loading).toBe(true);

    await mount('');
    expect(latest.songs).toEqual([]);
    expect(latest.loading).toBe(false);

    await mount('zzz'); // a different query after the clear: the old rows must not come back
    expect(latest.songs).toEqual([]);
    expect(latest.total).toBe(0);
    expect(latest.artists).toEqual([]);
    expect(latest.loading).toBe(true);
  });
});
