/**
 * The search text and the open artist live in the address bar, `/?q=<text>&artist=<id>`, so a reload, a shared link
 * or the back button brings them back (T006, T008).
 *
 * Why not `useSearchParams`: under `output: 'export'` it forces a Suspense boundary and client-side bailout of
 * the whole page at build time. This store reads `window.location` itself, so the page still pre-renders its
 * static shell (empty search) and the real value is picked up on the client right after hydration
 * (`useSyncExternalStore` renders the server snapshot first, so there is no hydration mismatch).
 *
 * History rules (A-012): typing uses `history.replaceState`, so it never adds entries. Opening an artist uses
 * `history.pushState` once, so the browser Back button returns to the results. Back/forward arrive as `popstate`.
 */

export const QUERY_PARAM = 'q';
export const ARTIST_PARAM = 'artist';

/** The `q` value in a location search string (`?q=a+b` gives `a b`); '' when absent. */
export function readQuery(search: string): string {
  return new URLSearchParams(search).get(QUERY_PARAM) ?? '';
}

/** The `artist` id in a location search string; null when absent or empty. Percent-decoded (`b.o.b`, `a%2Bb`, unicode). */
export function readArtist(search: string): string | null {
  const id = new URLSearchParams(search).get(ARTIST_PARAM);
  return id === null || id === '' ? null : id;
}

function toSearch(params: URLSearchParams): string {
  const out = params.toString();
  return out === '' ? '' : `?${out}`;
}

/**
 * The search string for a new text: other params are kept, `q` is set, or removed when the text is empty.
 * Returns '' or a string that starts with '?'.
 */
export function writeQuery(search: string, text: string): string {
  const params = new URLSearchParams(search);
  if (text === '') params.delete(QUERY_PARAM);
  else params.set(QUERY_PARAM, text);
  return toSearch(params);
}

/** The search string with `artist` set (an id), or removed (null). Other params are kept. */
export function writeArtist(search: string, artistId: string | null): string {
  const params = new URLSearchParams(search);
  if (artistId === null || artistId === '') params.delete(ARTIST_PARAM);
  else params.set(ARTIST_PARAM, artistId);
  return toSearch(params);
}

/** `?q=<text>&artist=<id>` from scratch (either part may be missing). Used for the artist links. */
export function buildSearch(query: string, artistId: string | null): string {
  return writeArtist(writeQuery('', query), artistId);
}

/** What the address bar says: the typed text and the open artist (null = the normal results). */
export interface NavState {
  query: string;
  artist: string | null;
}

export interface NavStore {
  getSnapshot: () => NavState;
  getServerSnapshot: () => NavState;
  subscribe: (onChange: () => void) => () => void;
  /** Typing: replaces the URL (never pushes), and leaves the artist view. */
  setQuery: (text: string) => void;
  /** Opens an artist: saves the results' scroll position, then pushes ONE history entry. */
  openArtist: (artistId: string) => void;
  /** Back to the results: `history.back()` when this page pushed the artist entry, else it replaces the URL with `?q=`. */
  closeArtist: () => void;
  /** Drops an unknown artist id from the URL (replace, no entry). */
  dropArtist: () => void;
}

/** What this app keeps in `history.state` (next to whatever Next.js keeps there). */
export interface SongbookHistoryState {
  /** On the artist entry that `openArtist` pushed: Back stays in the app. A page opened directly on `?artist=` lacks it. */
  songbookFromResults?: true;
  /** On the results entry: where the page was scrolled when an artist was opened. */
  songbookScrollY?: number;
}

/** The app's own keys of an unknown `history.state`. */
export function readHistoryState(state: unknown): SongbookHistoryState {
  if (typeof state !== 'object' || state === null) return {};
  const raw = state as Record<string, unknown>;
  const out: SongbookHistoryState = {};
  if (raw.songbookFromResults === true) out.songbookFromResults = true;
  if (typeof raw.songbookScrollY === 'number' && Number.isFinite(raw.songbookScrollY)) out.songbookScrollY = raw.songbookScrollY;
  return out;
}

function asRecord(state: unknown): Record<string, unknown> {
  return typeof state === 'object' && state !== null ? { ...(state as Record<string, unknown>) } : {};
}

interface Env {
  location: Pick<Location, 'pathname' | 'search' | 'hash'>;
  history: Pick<History, 'replaceState' | 'pushState' | 'back' | 'state'> & { scrollRestoration?: ScrollRestoration };
  scrollY?: number;
  addEventListener: Window['addEventListener'];
  removeEventListener: Window['removeEventListener'];
}

const SERVER_STATE: NavState = { query: '', artist: null };

/**
 * A store for the query text and the open artist. The state is also kept in memory, so typing keeps working if
 * `replaceState` is refused (some embedded browsers throw); the URL is then simply not updated.
 */
export function createNavStore(getEnv: () => Env = () => window): NavStore {
  let state: NavState | null = null; // null until first read: the URL is read lazily, on the client only
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  function read(): NavState {
    const { search } = getEnv().location;
    return { query: readQuery(search), artist: readArtist(search) };
  }
  function commit(next: NavState) {
    if (state === null || state.query !== next.query || state.artist !== next.artist) state = next;
    notify();
  }
  function current(): NavState {
    state ??= read();
    return state;
  }

  const onPopState = () => commit(read());

  /** replaceState that never throws. Returns whether the address bar was updated. */
  function replace(search: string, extra: Record<string, unknown> = {}, dropKeys: string[] = []): boolean {
    const env = getEnv();
    try {
      const next = { ...asRecord(env.history.state), ...extra };
      for (const key of dropKeys) delete next[key];
      env.history.replaceState(next, '', `${env.location.pathname}${search}${env.location.hash}`);
      return true;
    } catch {
      return false;
    }
  }

  const withoutArtist = (query: string) => writeArtist(writeQuery(getEnv().location.search, query), null);

  return {
    getServerSnapshot: () => SERVER_STATE,
    getSnapshot: current,
    subscribe: (onChange) => {
      if (listeners.size === 0) {
        getEnv().addEventListener('popstate', onPopState);
        // We restore the scroll ourselves when going Back (the rows are not there when the browser would restore it).
        try {
          getEnv().history.scrollRestoration = 'manual';
        } catch {
          // Not settable here: the browser's own restoration stays.
        }
      }
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0) getEnv().removeEventListener('popstate', onPopState);
      };
    },
    setQuery: (text) => {
      replace(withoutArtist(text), {}, ['songbookFromResults']);
      commit({ query: text, artist: null });
    },
    openArtist: (artistId) => {
      const env = getEnv();
      const { query } = current();
      // The results entry remembers where it was scrolled, so Back can put it there.
      replace(env.location.search, { songbookScrollY: Math.round(env.scrollY ?? 0) });
      try {
        const entry = { ...asRecord(env.history.state), songbookFromResults: true } as Record<string, unknown>;
        delete entry.songbookScrollY; // the scroll belongs to the results entry, not to this one
        env.history.pushState(entry, '', `${env.location.pathname}${buildSearch(query, artistId)}${env.location.hash}`);
      } catch {
        // Cannot push here: show the artist anyway; the chevron then falls back to a replace.
      }
      commit({ query, artist: artistId });
    },
    closeArtist: () => {
      const env = getEnv();
      if (readHistoryState(env.history.state).songbookFromResults === true) {
        env.history.back(); // `popstate` follows and brings the results back
        return;
      }
      // Opened directly on `?artist=`: there is no results entry to go back to inside the app.
      const { query } = current();
      replace(withoutArtist(query), {}, ['songbookFromResults']);
      commit({ query, artist: null });
    },
    dropArtist: () => {
      const { query } = current();
      replace(withoutArtist(query), {}, ['songbookFromResults']);
      commit({ query, artist: null });
    },
  };
}
