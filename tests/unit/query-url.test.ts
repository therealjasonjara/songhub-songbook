import { describe, expect, it, vi } from 'vitest';
import { buildSearch, createNavStore, readArtist, readHistoryState, readQuery, writeArtist, writeQuery } from '@/lib/query-url';

describe('readQuery / writeQuery', () => {
  it('reads q, decoding + and %20, and gives "" when absent', () => {
    expect(readQuery('?q=hotel+californa')).toBe('hotel californa');
    expect(readQuery('?q=di%20ka%20na')).toBe('di ka na');
    expect(readQuery('')).toBe('');
    expect(readQuery('?x=1')).toBe('');
  });

  it('sets q, keeps other params, and removes q when the text is empty', () => {
    expect(writeQuery('', 'a b')).toBe('?q=a+b');
    expect(writeQuery('?x=1&q=old', 'new')).toBe('?x=1&q=new');
    expect(writeQuery('?q=old', '')).toBe('');
    expect(writeQuery('?x=1&q=old', '')).toBe('?x=1');
  });

  it('round-trips awkward characters', () => {
    for (const text of ["(I've Had) the Time", 'Ben&Ben', '100%', 'a=b#c', 'ñandú ?']) {
      expect(readQuery(writeQuery('', text))).toBe(text);
    }
  });
});


describe('artist id in the URL', () => {
  const ids = ['b.o.b', 'a+b', '100%', 'ñandú-ü', 'ben&ben', 'a=b#c', 'x y', 'ünï-コード', 'q?', 'a/b'];

  it('reads artist, and gives null when absent or empty', () => {
    expect(readArtist('?q=eagl&artist=eagles')).toBe('eagles');
    expect(readArtist('?q=eagl')).toBeNull();
    expect(readArtist('')).toBeNull();
    expect(readArtist('?artist=')).toBeNull();
  });

  it('round-trips dotted ids, plus, percent and unicode through build and read', () => {
    for (const id of ids) {
      const search = buildSearch('eagl', id);
      expect(readArtist(search), id).toBe(id);
      expect(readQuery(search), id).toBe('eagl');
      // the same through the real URL parser, as the browser would
      expect(readArtist(new URL(`http://x/${search}`).search), id).toBe(id);
    }
  });

  it('writes b.o.b as a plain dotted id, a plus and a percent escaped, unicode percent-encoded', () => {
    expect(buildSearch('bob', 'b.o.b')).toBe('?q=bob&artist=b.o.b');
    expect(buildSearch('a', 'a+b')).toBe('?q=a&artist=a%2Bb');
    expect(buildSearch('a', '100%')).toBe('?q=a&artist=100%25');
    expect(buildSearch('a', 'ñ')).toBe('?q=a&artist=%C3%B1');
    expect(decodeURIComponent('%C3%B1')).toBe('ñ');
  });

  it('builds with an empty text, and without an artist', () => {
    expect(buildSearch('', 'eagles')).toBe('?artist=eagles');
    expect(buildSearch('eagl', null)).toBe('?q=eagl');
    expect(buildSearch('', null)).toBe('');
  });

  it('writeArtist keeps other params and q, and removes artist for null or empty', () => {
    expect(writeArtist('?q=a', 'x')).toBe('?q=a&artist=x');
    expect(writeArtist('?q=a&artist=x&z=1', null)).toBe('?q=a&z=1');
    expect(writeArtist('?artist=x', '')).toBe('');
    expect(writeQuery('?q=a&artist=x', 'new')).toBe('?q=new&artist=x');
  });

  it('survives malformed percent sequences without throwing', () => {
    for (const search of ['?artist=%E0%A4%A', '?artist=%', '?artist=%zz&q=%', '?q=%E0%A4%A&artist=%FF']) {
      expect(() => readArtist(search)).not.toThrow();
      expect(() => readQuery(search)).not.toThrow();
    }
  });
});

describe('readHistoryState', () => {
  it('keeps only the keys this app owns, with the right types', () => {
    expect(readHistoryState(null)).toEqual({});
    expect(readHistoryState('x')).toEqual({});
    expect(readHistoryState({ songbookFromResults: true, songbookScrollY: 120, other: 1 })).toEqual({ songbookFromResults: true, songbookScrollY: 120 });
    expect(readHistoryState({ songbookFromResults: 'yes', songbookScrollY: NaN })).toEqual({});
  });
});

/** A tiny browser history: entries with a URL and a state, an index, `back()` that fires popstate. */
function fakeBrowser(url: string, state: unknown = null) {
  const entries: { url: string; state: unknown }[] = [{ url, state }];
  let index = 0;
  const listeners = new Set<() => void>();
  const loc = () => new URL(entries[index]!.url, 'http://x');
  const env = {
    location: {
      get pathname() { return loc().pathname; },
      get search() { return loc().search; },
      get hash() { return loc().hash; },
    },
    history: {
      get state() { return entries[index]!.state; },
      get length() { return entries.length; },
      scrollRestoration: 'auto' as ScrollRestoration,
      replaceState: vi.fn((s: unknown, _t: string, u: string) => { entries[index] = { url: u, state: s }; }),
      pushState: vi.fn((s: unknown, _t: string, u: string) => { entries.splice(index + 1); entries.push({ url: u, state: s }); index++; }),
      back: vi.fn(() => { if (index > 0) { index--; listeners.forEach((fn) => fn()); } }),
      forward: () => { if (index < entries.length - 1) { index++; listeners.forEach((fn) => fn()); } },
    },
    scrollY: 0,
    addEventListener: vi.fn((type: string, fn: () => void) => { if (type === 'popstate') listeners.add(fn); }),
    removeEventListener: vi.fn((type: string, fn: () => void) => { if (type === 'popstate') listeners.delete(fn); }),
    entries,
    listeners,
    get index() { return index; },
  };
  return env;
}

describe('createNavStore', () => {
  it('serves empty on the server and reads the URL lazily on the client', () => {
    const env = fakeBrowser('/?q=hotel&artist=eagles');
    const store = createNavStore(() => env as never);
    expect(store.getServerSnapshot()).toEqual({ query: '', artist: null });
    expect(store.getSnapshot()).toEqual({ query: 'hotel', artist: 'eagles' });
    expect(store.getSnapshot()).toBe(store.getSnapshot()); // a stable object, as useSyncExternalStore needs
  });

  it('setQuery replaces the URL (never pushes), notifies, and removes q when empty', () => {
    const env = fakeBrowser('/');
    const store = createNavStore(() => env as never);
    const onChange = vi.fn();
    store.subscribe(onChange);
    store.setQuery('hot');
    expect(env.history.replaceState).toHaveBeenLastCalledWith({}, '', '/?q=hot');
    expect(env.history.pushState).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toEqual({ query: 'hot', artist: null });
    expect(onChange).toHaveBeenCalledTimes(1);
    store.setQuery('');
    expect(env.history.replaceState).toHaveBeenLastCalledWith({}, '', '/');
    expect(store.getSnapshot().query).toBe('');
    expect(env.entries.length).toBe(1);
  });

  it('typing in the artist view leaves it: artist is removed by replace, no new entry', () => {
    const env = fakeBrowser('/?q=eagl');
    const store = createNavStore(() => env as never);
    store.getSnapshot();
    store.openArtist('eagles');
    expect(env.entries.length).toBe(2);
    store.setQuery('eagle');
    expect(store.getSnapshot()).toEqual({ query: 'eagle', artist: null });
    expect(env.entries.length).toBe(2);
    expect(env.entries[1]!.url).toBe('/?q=eagle');
    expect(readHistoryState(env.entries[1]!.state).songbookFromResults).toBeUndefined();
    store.openArtist('eagles');
    store.setQuery('');
    expect(env.entries[env.index]!.url).toBe('/');
    expect(store.getSnapshot()).toEqual({ query: '', artist: null });
  });

  it('openArtist pushes exactly one entry, saves the scroll on the results entry, keeps other state', () => {
    const env = fakeBrowser('/?q=eagl', { __NA: true });
    env.scrollY = 412.6;
    const store = createNavStore(() => env as never);
    store.getSnapshot();
    store.openArtist('b.o.b');
    expect(env.history.pushState).toHaveBeenCalledTimes(1);
    expect(env.history.length).toBe(2);
    expect(env.entries[0]).toEqual({ url: '/?q=eagl', state: { __NA: true, songbookScrollY: 413 } });
    expect(env.entries[1]!.url).toBe('/?q=eagl&artist=b.o.b');
    expect(env.entries[1]!.state).toEqual({ __NA: true, songbookFromResults: true });
    expect(store.getSnapshot()).toEqual({ query: 'eagl', artist: 'b.o.b' });
  });

  it('closeArtist goes Back when the app pushed the entry, and the results come back through popstate', () => {
    const env = fakeBrowser('/?q=eagl');
    const store = createNavStore(() => env as never);
    const onChange = vi.fn();
    store.subscribe(onChange);
    store.openArtist('eagles');
    onChange.mockClear();
    store.closeArtist();
    expect(env.history.back).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({ query: 'eagl', artist: null });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(readHistoryState(env.history.state).songbookScrollY).toBe(0);
  });

  it('closeArtist on a page opened directly on ?artist= replaces the URL with ?q= and stays in the app', () => {
    const env = fakeBrowser('/?q=eagl&artist=eagles');
    const store = createNavStore(() => env as never);
    store.getSnapshot();
    store.closeArtist();
    expect(env.history.back).not.toHaveBeenCalled();
    expect(env.entries.length).toBe(1);
    expect(env.entries[0]!.url).toBe('/?q=eagl');
    expect(store.getSnapshot()).toEqual({ query: 'eagl', artist: null });
    // no q: the URL becomes the plain home
    const home = fakeBrowser('/?artist=eagles');
    const homeStore = createNavStore(() => home as never);
    homeStore.getSnapshot();
    homeStore.closeArtist();
    expect(home.entries[0]!.url).toBe('/');
  });

  it('a reload on the pushed artist entry still goes Back inside the app (the flag lives in history.state)', () => {
    const env = fakeBrowser('/?q=eagl&artist=eagles', { songbookFromResults: true });
    const store = createNavStore(() => env as never);
    store.getSnapshot();
    store.closeArtist();
    expect(env.history.back).toHaveBeenCalledTimes(1);
  });

  it('dropArtist removes an unknown id with a replace', () => {
    const env = fakeBrowser('/?q=eagl&artist=nobody');
    const store = createNavStore(() => env as never);
    store.getSnapshot();
    store.dropArtist();
    expect(env.entries.length).toBe(1);
    expect(env.entries[0]!.url).toBe('/?q=eagl');
    expect(store.getSnapshot()).toEqual({ query: 'eagl', artist: null });
  });

  it('follows popstate (back/forward) for both the text and the artist, and cleans up its listener', () => {
    const env = fakeBrowser('/?q=one');
    const store = createNavStore(() => env as never);
    const onChange = vi.fn();
    const off = store.subscribe(onChange);
    expect(env.history.scrollRestoration).toBe('manual');
    store.openArtist('eagles');
    env.history.back();
    expect(store.getSnapshot()).toEqual({ query: 'one', artist: null });
    env.history.forward();
    expect(store.getSnapshot()).toEqual({ query: 'one', artist: 'eagles' });
    off();
    expect(env.listeners.size).toBe(0);
  });

  it('keeps working in memory when replaceState or pushState throw', () => {
    const env = fakeBrowser('/');
    env.history.replaceState.mockImplementation(() => { throw new Error('SecurityError'); });
    env.history.pushState.mockImplementation(() => { throw new Error('SecurityError'); });
    const store = createNavStore(() => env as never);
    store.setQuery('abc');
    expect(store.getSnapshot()).toEqual({ query: 'abc', artist: null });
    store.openArtist('x');
    expect(store.getSnapshot()).toEqual({ query: 'abc', artist: 'x' });
    store.closeArtist();
    expect(store.getSnapshot()).toEqual({ query: 'abc', artist: null });
  });
});
