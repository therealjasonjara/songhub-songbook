import { describe, expect, it, vi } from 'vitest';
import { createQueryStore, readQuery, writeQuery } from '@/lib/query-url';

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

function fakeEnv(search: string) {
  const listeners = new Map<string, Set<() => void>>();
  const env = {
    location: { pathname: '/', search, hash: '' },
    history: { state: null, replaceState: vi.fn((_s: unknown, _t: string, url: string) => { env.location.search = new URL(url, 'http://x').search; }) },
    addEventListener: vi.fn((type: string, fn: () => void) => { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn); }),
    removeEventListener: vi.fn((type: string, fn: () => void) => { listeners.get(type)?.delete(fn); }),
    fire: (type: string) => listeners.get(type)?.forEach((fn) => fn()),
    count: (type: string) => listeners.get(type)?.size ?? 0,
  };
  return env;
}

describe('createQueryStore', () => {
  it('serves "" on the server and reads the URL lazily on the client', () => {
    const env = fakeEnv('?q=hotel');
    const store = createQueryStore(() => env as never);
    expect(store.getServerSnapshot()).toBe('');
    expect(store.getSnapshot()).toBe('hotel');
  });

  it('set() replaces the URL (never pushes), notifies, and removes q when empty', () => {
    const env = fakeEnv('');
    const store = createQueryStore(() => env as never);
    const onChange = vi.fn();
    store.subscribe(onChange);
    store.set('hot');
    expect(env.history.replaceState).toHaveBeenLastCalledWith(null, '', '/?q=hot');
    expect(store.getSnapshot()).toBe('hot');
    expect(onChange).toHaveBeenCalledTimes(1);
    store.set('');
    expect(env.history.replaceState).toHaveBeenLastCalledWith(null, '', '/');
    expect(store.getSnapshot()).toBe('');
  });

  it('follows popstate (back/forward) and cleans up its listener', () => {
    const env = fakeEnv('?q=one');
    const store = createQueryStore(() => env as never);
    const onChange = vi.fn();
    const off = store.subscribe(onChange);
    expect(store.getSnapshot()).toBe('one');
    env.location.search = '?q=two';
    env.fire('popstate');
    expect(store.getSnapshot()).toBe('two');
    expect(onChange).toHaveBeenCalledTimes(1);
    off();
    expect(env.count('popstate')).toBe(0);
  });

  it('keeps working in memory when replaceState throws', () => {
    const env = fakeEnv('');
    env.history.replaceState.mockImplementation(() => { throw new Error('SecurityError'); });
    const store = createQueryStore(() => env as never);
    store.set('abc');
    expect(store.getSnapshot()).toBe('abc');
  });
});
