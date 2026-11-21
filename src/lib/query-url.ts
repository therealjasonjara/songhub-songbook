/**
 * The search text lives in the address bar as `?q=` so a reload or the back button brings it back (T006).
 *
 * Why not `useSearchParams`: under `output: 'export'` it forces a Suspense boundary and client-side bailout of
 * the whole page at build time. This store reads `window.location` itself, so the page still pre-renders its
 * static shell (empty search) and the real value is picked up on the client right after hydration
 * (`useSyncExternalStore` renders the server snapshot `''` first, so there is no hydration mismatch).
 * Typing uses `history.replaceState`, so it never adds history entries; back/forward arrive as `popstate`.
 */

export const QUERY_PARAM = 'q';

/** The `q` value in a location search string (`?q=a+b` gives `a b`); '' when absent. */
export function readQuery(search: string): string {
  return new URLSearchParams(search).get(QUERY_PARAM) ?? '';
}

/**
 * The search string for a new text: other params are kept, `q` is set, or removed when the text is empty.
 * Returns '' or a string that starts with '?'.
 */
export function writeQuery(search: string, text: string): string {
  const params = new URLSearchParams(search);
  if (text === '') params.delete(QUERY_PARAM);
  else params.set(QUERY_PARAM, text);
  const out = params.toString();
  return out === '' ? '' : `?${out}`;
}

export interface QueryStore {
  getSnapshot: () => string;
  getServerSnapshot: () => string;
  subscribe: (onChange: () => void) => () => void;
  set: (text: string) => void;
}

interface Env {
  location: Pick<Location, 'pathname' | 'search' | 'hash'>;
  history: Pick<History, 'replaceState' | 'state'>;
  addEventListener: Window['addEventListener'];
  removeEventListener: Window['removeEventListener'];
}

/**
 * A store for the query text. The text is also kept in memory, so typing keeps working if `replaceState` is
 * refused (some embedded browsers throw); the URL is then simply not updated.
 */
export function createQueryStore(getEnv: () => Env = () => window): QueryStore {
  let memory: string | null = null; // null until first read: the URL is read lazily, on the client only
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const onPopState = () => {
    memory = readQuery(getEnv().location.search);
    notify();
  };

  return {
    getServerSnapshot: () => '',
    getSnapshot: () => {
      memory ??= readQuery(getEnv().location.search);
      return memory;
    },
    subscribe: (onChange) => {
      if (listeners.size === 0) getEnv().addEventListener('popstate', onPopState);
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0) getEnv().removeEventListener('popstate', onPopState);
      };
    },
    set: (text) => {
      memory = text;
      const env = getEnv();
      try {
        env.history.replaceState(env.history.state, '', `${env.location.pathname}${writeQuery(env.location.search, text)}${env.location.hash}`);
      } catch {
        // The address bar cannot be updated here; the text still works in memory.
      }
      notify();
    },
  };
}
