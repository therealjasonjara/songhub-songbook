import { describe, expect, it } from 'vitest';
import { createSearchClient, LOAD_ERROR_MESSAGE, type EngineTransport, type TransportHandlers } from '../../src/lib/search/client';
import type { EngineRequest, EngineResponse } from '../../src/lib/search/protocol';
import type { SongSearchResult } from '../../src/lib/search/types';

/** A transport whose far end is the test: it records what the client posts and lets the test answer. */
class FakeEngine {
  readonly posted: EngineRequest[] = [];
  terminated = false;
  readonly handlers: TransportHandlers;
  constructor(handlers: TransportHandlers) {
    this.handlers = handlers;
  }
  readonly transport: EngineTransport = {
    post: (request) => this.posted.push(request),
    terminate: () => {
      this.terminated = true;
    },
  };
  reply(response: EngineResponse): void {
    this.handlers.onMessage(response);
  }
  get queries(): EngineRequest[] {
    return this.posted.filter((r) => r.type !== 'init');
  }
}

function setup(failOnCreate = false) {
  const engines: FakeEngine[] = [];
  const client = createSearchClient((handlers) => {
    if (failOnCreate && engines.length === 0) {
      engines.push(new FakeEngine(handlers));
      throw new Error('Worker construction blocked');
    }
    const engine = new FakeEngine(handlers);
    engines.push(engine);
    return engine.transport;
  });
  return { client, engines, current: () => engines[engines.length - 1] as FakeEngine };
}

const result = (n: number): SongSearchResult => ({
  results: [{ n, title: `Song ${n}`, credit: 'Someone', artists: [] }],
  total: 1,
  hasMore: false,
});

const rejection = (p: Promise<unknown>) => p.then(() => null, (error: Error) => error);

describe('search client: loading and ready', () => {
  it('starts loading, asks the engine to load once, and goes ready on the ready message', () => {
    const { client, engines, current } = setup();
    expect(client.status).toBe('loading');
    expect(engines).toHaveLength(1);
    expect(current().posted).toEqual([{ type: 'init', fresh: false }]);
    let notified = 0;
    client.subscribe(() => notified++);
    current().reply({ type: 'ready' });
    expect(client.status).toBe('ready');
    expect(notified).toBe(1);
    current().reply({ type: 'ready' }); // a repeated ready is not a change
    expect(notified).toBe(1);
  });

  it('stops notifying after unsubscribe', () => {
    const { client, current } = setup();
    let notified = 0;
    const off = client.subscribe(() => notified++);
    off();
    current().reply({ type: 'ready' });
    expect(notified).toBe(0);
  });

  it('sends a query at once when ready and resolves it with the answer carrying the same requestId', async () => {
    const { client, current } = setup();
    current().reply({ type: 'ready' });
    const pending = client.search('hotel');
    expect(current().queries).toEqual([{ type: 'search', requestId: 1, query: 'hotel' }]);
    current().reply({ type: 'search', requestId: 1, result: result(7) });
    await expect(pending).resolves.toEqual(result(7));
  });

  it('gives every request its own increasing requestId and routes each answer by kind', async () => {
    const { client, current } = setup();
    current().reply({ type: 'ready' });
    const s = client.search('eag');
    const a = client.suggestArtists('eag');
    const b = client.songsByArtist('eagles');
    const ids = current().queries.map((q) => (q.type === 'init' ? 0 : q.requestId));
    expect(ids).toEqual([1, 2, 3]);
    // answers out of order, each to its own promise
    current().reply({ type: 'songsByArtist', requestId: 3, songs: [] });
    current().reply({ type: 'suggestArtists', requestId: 2, artists: [{ id: 'eagles', name: 'Eagles', count: 9 }] });
    current().reply({ type: 'search', requestId: 1, result: result(1) });
    await expect(b).resolves.toEqual([]);
    await expect(a).resolves.toEqual([{ id: 'eagles', name: 'Eagles', count: 9 }]);
    await expect(s).resolves.toEqual(result(1));
  });
});

describe('search client: typing before ready', () => {
  it('posts nothing before ready, then only the latest query of each kind', async () => {
    const { client, current } = setup();
    const first = client.search('h');
    const second = client.search('ho');
    const third = client.search('hot');
    const suggestOld = client.suggestArtists('h');
    const suggestNew = client.suggestArtists('hot');
    expect(current().queries).toEqual([]);
    // superseded questions resolve to null straight away: nobody renders them
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toBeNull();
    await expect(suggestOld).resolves.toBeNull();

    current().reply({ type: 'ready' });
    expect(current().queries).toEqual([
      { type: 'search', requestId: 3, query: 'hot' },
      { type: 'suggestArtists', requestId: 5, query: 'hot' },
    ]);
    current().reply({ type: 'search', requestId: 3, result: result(3) });
    current().reply({ type: 'suggestArtists', requestId: 5, artists: [] });
    await expect(third).resolves.toEqual(result(3));
    await expect(suggestNew).resolves.toEqual([]);
  });

  it('a query typed after ready supersedes one still queued from before', async () => {
    const { client, current } = setup();
    const early = client.search('hot');
    current().reply({ type: 'ready' }); // flushes 'hot' as id 1
    const later = client.search('hotel');
    await expect(early).resolves.toBeNull();
    current().reply({ type: 'search', requestId: 1, result: result(1) }); // the stale answer arrives
    current().reply({ type: 'search', requestId: 2, result: result(2) });
    await expect(later).resolves.toEqual(result(2));
  });
});

describe('search client: latest request wins', () => {
  it('discards an old answer that arrives after a newer question was asked', async () => {
    const { client, current } = setup();
    current().reply({ type: 'ready' });
    const a = client.search('a');
    const ab = client.search('ab');
    await expect(a).resolves.toBeNull();
    current().reply({ type: 'search', requestId: 1, result: result(1) }); // stale: must not resolve anything
    let resolved = false;
    void ab.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    current().reply({ type: 'search', requestId: 2, result: result(2) });
    await expect(ab).resolves.toEqual(result(2));
  });

  it('discards an old answer that arrives after the newer one was already answered', async () => {
    const { client, current } = setup();
    current().reply({ type: 'ready' });
    const a = client.search('a');
    const ab = client.search('ab');
    current().reply({ type: 'search', requestId: 2, result: result(2) });
    current().reply({ type: 'search', requestId: 1, result: result(1) });
    await expect(ab).resolves.toEqual(result(2));
    await expect(a).resolves.toBeNull();
  });

  it('ignores an answer with an unknown requestId or the wrong kind', async () => {
    const { client, current } = setup();
    current().reply({ type: 'ready' });
    const p = client.search('x');
    current().reply({ type: 'suggestArtists', requestId: 1, artists: [] }); // id 1 belongs to a search
    current().reply({ type: 'search', requestId: 99, result: result(99) });
    let resolved = false;
    void p.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    current().reply({ type: 'search', requestId: 1, result: result(1) });
    await expect(p).resolves.toEqual(result(1));
  });

  it('a per-request error rejects only that request and keeps the client ready', async () => {
    const { client, current } = setup();
    current().reply({ type: 'ready' });
    const s = client.search('x');
    const a = client.suggestArtists('x');
    current().reply({ type: 'error', requestId: 1, message: 'boom' });
    await expect(s).rejects.toThrow('boom');
    expect(client.status).toBe('ready');
    current().reply({ type: 'suggestArtists', requestId: 2, artists: [] });
    await expect(a).resolves.toEqual([]);
  });
});

describe('search client: load failure and retry', () => {
  it('goes to error on an engine error without requestId, rejects what waits, rejects new questions', async () => {
    const { client, current } = setup();
    const waiting = rejection(client.search('hot'));
    current().reply({ type: 'error', message: 'songs.json: HTTP 500' });
    expect(client.status).toBe('error');
    expect(client.lastError).toBe('songs.json: HTTP 500');
    expect(current().terminated).toBe(true);
    expect((await waiting)?.message).toBe('songs.json: HTTP 500');
    await expect(client.search('more')).rejects.toThrow();
  });

  it('goes to error when the worker itself dies', () => {
    const { client, current } = setup();
    current().handlers.onFailure('Script error');
    expect(client.status).toBe('error');
  });

  it('retry starts a fresh engine that skips the HTTP cache, goes loading then ready, and works again', async () => {
    const { client, engines, current } = setup();
    current().reply({ type: 'error', message: 'offline' });
    const seen: string[] = [];
    client.subscribe(() => seen.push(client.status));
    client.retry();
    expect(engines).toHaveLength(2);
    expect(current().posted).toEqual([{ type: 'init', fresh: true }]);
    expect(client.status).toBe('loading');
    expect(client.lastError).toBeNull();
    const queued = client.search('hotel californa'); // typed while it reloads
    current().reply({ type: 'ready' });
    expect(current().queries).toEqual([{ type: 'search', requestId: 1, query: 'hotel californa' }]);
    current().reply({ type: 'search', requestId: 1, result: result(5) });
    await expect(queued).resolves.toEqual(result(5));
    expect(seen).toEqual(['loading', 'ready']);
  });

  it('a late message from the discarded engine cannot change the new one', () => {
    const { client, engines, current } = setup();
    engines[0]?.reply({ type: 'error', message: 'first failed' });
    client.retry();
    engines[0]?.reply({ type: 'ready' }); // the old engine sends a late ready
    expect(client.status).toBe('loading');
    current().reply({ type: 'ready' });
    expect(client.status).toBe('ready');
  });

  it('retry does nothing unless the client is in error', () => {
    const { client, engines } = setup();
    client.retry();
    expect(engines).toHaveLength(1);
  });

  it('turns a throwing transport factory into the error state, and retry can recover', () => {
    const { client, engines } = setup(true);
    expect(client.status).toBe('error');
    client.retry();
    expect(engines).toHaveLength(2);
    expect(client.status).toBe('loading');
  });

  it('exports the exact guest-facing error text', () => {
    expect(LOAD_ERROR_MESSAGE).toBe("Couldn't load the song book. Check your connection and try again.");
  });

  it('dispose terminates the engine and rejects what waits', async () => {
    const { client, current } = setup();
    const waiting = client.search('x');
    client.dispose();
    expect(current().terminated).toBe(true);
    await expect(waiting).rejects.toThrow();
  });
});

describe('search client: retry, epochs and dispose', () => {
  it('a late onFailure from the discarded engine is ignored after a retry', () => {
    const { client, engines, current } = setup();
    engines[0]?.reply({ type: 'error', message: 'first failed' });
    client.retry();
    engines[0]?.handlers.onFailure('old worker died late');
    expect(client.status).toBe('loading');
    expect(client.lastError).toBeNull();
    expect(current().terminated).toBe(false);
    current().reply({ type: 'ready' });
    expect(client.status).toBe('ready');
  });

  it('a late onFailure after dispose is ignored', () => {
    const { client, current } = setup();
    const engine = current();
    client.dispose();
    engine.handlers.onFailure('died after dispose');
    expect(client.status).toBe('loading');
    expect(client.lastError).toBeNull();
  });

  it('dispose bumps the epoch: late messages from the stopped engine change nothing and flush nothing', async () => {
    const { client, current } = setup();
    const engine = current();
    const waiting = rejection(client.search('x'));
    client.dispose();
    await waiting;
    engine.reply({ type: 'ready' });
    expect(client.status).toBe('loading');
    expect(engine.queries).toEqual([]);
  });

  it('dispose clears the listeners: nothing is notified by a late message', () => {
    const { client, current } = setup();
    let notified = 0;
    client.subscribe(() => notified++);
    const engine = current();
    client.dispose();
    engine.reply({ type: 'ready' });
    engine.reply({ type: 'error', message: 'late' });
    expect(notified).toBe(0);
  });

  it('a question asked after dispose rejects instead of hanging, in every state and for every kind', async () => {
    const loading = setup();
    loading.client.dispose();
    await expect(loading.client.search('x')).rejects.toThrow(/disposed/);
    await expect(loading.client.suggestArtists('x')).rejects.toThrow(/disposed/);
    await expect(loading.client.songsByArtist('x')).rejects.toThrow(/disposed/);
    expect(loading.current().queries).toEqual([]);

    const ready = setup();
    ready.current().reply({ type: 'ready' });
    ready.client.dispose();
    await expect(ready.client.search('x')).rejects.toThrow(/disposed/);
    expect(ready.current().queries).toEqual([]);
  });

  it('retry after dispose does nothing, even from the error state', () => {
    const { client, engines, current } = setup();
    current().reply({ type: 'error', message: 'offline' });
    client.dispose();
    client.retry();
    expect(engines).toHaveLength(1);
    expect(client.status).toBe('error');
  });

  it('never resets the requestId counter on retry, so a late answer cannot match a new question', async () => {
    const { client, engines, current } = setup();
    current().reply({ type: 'ready' });
    const first = client.search('a'); // id 1
    current().reply({ type: 'error', message: 'worker died' });
    await rejection(first);
    client.retry();
    current().reply({ type: 'ready' });
    const again = client.search('b');
    expect(current().queries).toEqual([{ type: 'search', requestId: 2, query: 'b' }]);
    engines[0]?.reply({ type: 'search', requestId: 2, result: result(99) }); // the old engine answers id 2 late
    current().reply({ type: 'search', requestId: 1, result: result(98) }); // an answer with the old id on the new engine
    let resolved = false;
    void again.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    current().reply({ type: 'search', requestId: 2, result: result(2) });
    await expect(again).resolves.toEqual(result(2));
  });
});
