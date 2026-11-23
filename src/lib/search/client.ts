/// Main-thread service in front of the search engine. Starts the engine as early as it is first used, keeps a
/// status, and gives every question a latest-request-wins answer. This is the only module of the engine that
/// touches the DOM (`Worker`, `fetch` for the fallback).
import { buildIndexAsync } from './build';
import { createEngineRunner } from './engine';
import { fetchDatasetTexts } from './fetch';
import type { EngineRequest, EngineResponse, EngineStatus, RequestKind } from './protocol';
import type { ArtistSuggestion, SongHit, SongSearchResult } from './types';

/** Shown to the guest when the dataset cannot be loaded (T005 acceptance criteria). */
export const LOAD_ERROR_MESSAGE = "Couldn't load the song book. Check your connection and try again.";

/** Shown when the song book is loaded but one search failed (the engine answered that request with an error). */
export const SEARCH_ERROR_MESSAGE = 'That search failed. Try again.';

const DISPOSED_MESSAGE = 'The search client was disposed.';

/** What one side of the wire looks like: send a request, stop. The reply comes through the factory's handlers. */
export interface EngineTransport {
  post: (request: EngineRequest) => void;
  terminate: () => void;
}

export interface TransportHandlers {
  onMessage: (response: EngineResponse) => void;
  /** The engine itself died (worker script failed to load or threw): the whole song book is unavailable. */
  onFailure: (message: string) => void;
}

export type TransportFactory = (handlers: TransportHandlers) => EngineTransport;

interface Results {
  search: SongSearchResult;
  suggestArtists: ArtistSuggestion[];
  songsByArtist: SongHit[];
}

export interface SearchClient {
  readonly status: EngineStatus;
  /** Why the last load failed (technical text for logs; show `LOAD_ERROR_MESSAGE` to the guest). */
  readonly lastError: string | null;
  subscribe: (listener: () => void) => () => void;
  /**
   * Each of the three questions is latest-request-wins on its own: asking again supersedes the previous
   * question of the same kind, and its promise resolves to `null` (nobody should render it). While the dataset
   * is loading only the latest question of each kind is kept, and it is answered as soon as the index is ready.
   * The promise rejects if the song book failed to load.
   */
  search: (query: string) => Promise<SongSearchResult | null>;
  suggestArtists: (query: string) => Promise<ArtistSuggestion[] | null>;
  songsByArtist: (artistId: string) => Promise<SongHit[] | null>;
  /** After an error: load again (skipping the HTTP cache). */
  retry: () => void;
  /** Stops the engine and rejects whatever is waiting. Afterwards every question rejects and `retry` does nothing. */
  dispose: () => void;
}

interface Slot {
  id: number;
  payload: string;
  sent: boolean;
  resolve: (value: never) => void;
  reject: (error: Error) => void;
}

function toRequest(kind: RequestKind, slot: Slot): EngineRequest {
  switch (kind) {
    case 'search':
      return { type: 'search', requestId: slot.id, query: slot.payload };
    case 'suggestArtists':
      return { type: 'suggestArtists', requestId: slot.id, query: slot.payload };
    case 'songsByArtist':
      return { type: 'songsByArtist', requestId: slot.id, artistId: slot.payload };
  }
}

export function createSearchClient(factory: TransportFactory): SearchClient {
  let status: EngineStatus = 'loading';
  let lastError: string | null = null;
  let transport: EngineTransport | null = null;
  let nextId = 1;
  let epoch = 0;
  let disposed = false;
  const slots: Partial<Record<RequestKind, Slot>> = {};
  const listeners = new Set<() => void>();

  function setStatus(next: EngineStatus): void {
    if (status === next) return;
    status = next;
    for (const listener of [...listeners]) listener();
  }

  function rejectAll(message: string): void {
    for (const kind of Object.keys(slots) as RequestKind[]) {
      const slot = slots[kind];
      delete slots[kind];
      slot?.reject(new Error(message));
    }
  }

  function fail(message: string): void {
    lastError = message;
    transport?.terminate();
    transport = null;
    rejectAll(message);
    setStatus('error');
  }

  function flush(): void {
    for (const kind of Object.keys(slots) as RequestKind[]) {
      const slot = slots[kind];
      if (slot && !slot.sent) {
        slot.sent = true;
        transport?.post(toRequest(kind, slot));
      }
    }
  }

  function start(fresh: boolean): void {
    const mine = ++epoch;
    lastError = null;
    let created: EngineTransport;
    try {
      created = factory({
        onMessage: (response) => {
          if (mine === epoch) onMessage(response);
        },
        onFailure: (message) => {
          if (mine === epoch) fail(message);
        },
      });
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
      return;
    }
    transport = created;
    setStatus('loading');
    created.post({ type: 'init', fresh });
  }

  function onMessage(response: EngineResponse): void {
    switch (response.type) {
      case 'ready':
        setStatus('ready');
        flush();
        return;
      case 'error': {
        if (response.requestId === undefined) {
          fail(response.message);
          return;
        }
        for (const kind of Object.keys(slots) as RequestKind[]) {
          const slot = slots[kind];
          if (slot?.id === response.requestId) {
            delete slots[kind];
            slot.reject(new Error(response.message));
          }
        }
        return;
      }
      case 'search':
      case 'suggestArtists':
      case 'songsByArtist': {
        const slot = slots[response.type];
        // A reply to a question that was superseded in the meantime is dropped.
        if (!slot || slot.id !== response.requestId) return;
        delete slots[response.type];
        const value = response.type === 'search' ? response.result : response.type === 'suggestArtists' ? response.artists : response.songs;
        (slot.resolve as (v: unknown) => void)(value);
        return;
      }
    }
  }

  function ask<K extends RequestKind>(kind: K, payload: string): Promise<Results[K] | null> {
    if (disposed) return Promise.reject(new Error(DISPOSED_MESSAGE));
    if (status === 'error') return Promise.reject(new Error(lastError ?? LOAD_ERROR_MESSAGE));
    return new Promise<Results[K] | null>((resolve, reject) => {
      const previous = slots[kind];
      previous?.resolve(null as never);
      const slot: Slot = { id: nextId++, payload, sent: false, resolve: resolve as (value: never) => void, reject };
      slots[kind] = slot;
      if (status === 'ready') {
        slot.sent = true;
        transport?.post(toRequest(kind, slot));
      }
    });
  }

  start(false);

  return {
    get status() {
      return status;
    },
    get lastError() {
      return lastError;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    search: (query) => ask('search', query),
    suggestArtists: (query) => ask('suggestArtists', query),
    songsByArtist: (artistId) => ask('songsByArtist', artistId),
    retry() {
      if (disposed || status !== 'error') return;
      start(true);
    },
    dispose() {
      disposed = true;
      epoch++; // late messages from the stopped engine are ignored from here on
      transport?.terminate();
      transport = null;
      rejectAll(DISPOSED_MESSAGE);
      listeners.clear();
    },
  };
}

/* -------------------------------------------------------------------------------------------------------------- */
/* Browser transports                                                                                             */
/* -------------------------------------------------------------------------------------------------------------- */

/**
 * Fallback when Web Workers are unavailable (or blocked, e.g. by a strict CSP): the same engine runs on the main
 * thread. The dataset fetch is asynchronous anyway; the index is added in chunks of 1,000 documents with a
 * `setTimeout(0)` yield between chunks (`buildIndexAsync`), so the page stays responsive while it builds, at the
 * cost of a longer total build. The artist lists (`prepare`) and each query run in one go; both are tens of
 * milliseconds or less (A-007). Replies are delivered on a microtask so a caller never sees a synchronous answer.
 */
export function createMainThreadTransport(handlers: TransportHandlers): EngineTransport {
  let closed = false;
  const runner = createEngineRunner({
    load: fetchDatasetTexts,
    post: (response) => {
      queueMicrotask(() => {
        if (!closed) handlers.onMessage(response);
      });
    },
    build: (dataset) => buildIndexAsync(dataset),
  });
  return {
    post: (request) => runner.handle(request),
    terminate: () => {
      closed = true;
    },
  };
}

export function createWorkerTransport(handlers: TransportHandlers): EngineTransport {
  // The literal `new Worker(new URL(..., import.meta.url))` form is what the bundler (Turbopack) recognises.
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<EngineResponse>) => handlers.onMessage(event.data);
  worker.onerror = (event) => handlers.onFailure(event.message || 'The search worker failed.');
  worker.onmessageerror = () => handlers.onFailure('The search worker sent a message that could not be read.');
  return {
    post: (request) => worker.postMessage(request),
    terminate: () => worker.terminate(),
  };
}

/** Worker when the browser has one, main thread otherwise (also when constructing the worker throws). */
export const browserTransportFactory: TransportFactory = (handlers) => {
  if (typeof Worker !== 'undefined') {
    try {
      return createWorkerTransport(handlers);
    } catch {
      // fall through to the main-thread engine
    }
  }
  return createMainThreadTransport(handlers);
};

let shared: SearchClient | null = null;

/** The one client of the page. Created (and the load started) on first call, in the browser only. */
export function getSearchClient(): SearchClient {
  shared ??= createSearchClient(browserTransportFactory);
  return shared;
}

/** `useSyncExternalStore` plumbing: no client is created while rendering (nor on the server). */
export function subscribeToStatus(listener: () => void): () => void {
  return getSearchClient().subscribe(listener);
}
export function getStatusSnapshot(): EngineStatus {
  return shared?.status ?? 'loading';
}
