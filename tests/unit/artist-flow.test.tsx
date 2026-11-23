// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseArtistSongsResult } from '@/hooks/use-artist-songs';
import type { UseSearchResult } from '@/hooks/use-search';
import { LOAD_ERROR_MESSAGE, SEARCH_ERROR_MESSAGE } from '@/lib/search/client';
import type { ArtistSuggestion, SongHit } from '@/lib/search/types';

const retry = vi.fn();
const artistRetry = vi.fn();
const search: { current: UseSearchResult } = { current: base() };
function base(over: Partial<UseSearchResult> = {}): UseSearchResult {
  return { status: 'ready', songs: [], total: 0, hasMore: false, artists: [], loading: false, error: null, retry, ...over };
}
const hit = (n: number, title = `Title ${n}`, credit = 'Artist'): SongHit => ({ n, title, credit, artists: [] });
const suggestion = (id: string, name: string, count: number): ArtistSuggestion => ({ id, name, count });

/** The artist lists the mocked engine knows, by id. An id that is not here is unknown. */
const lists: Record<string, SongHit[]> = {};
const pending = new Set<string>();
vi.mock('@/hooks/use-search', () => ({ useSearch: () => search.current }));
vi.mock('@/hooks/use-artist-songs', () => ({
  useArtistSongs: (id: string | null): UseArtistSongsResult => {
    if (id === null) return { status: 'idle', heading: null, songs: [], retry: artistRetry };
    if (pending.has(id)) return { status: 'loading', heading: null, songs: [], retry: artistRetry };
    const songs = lists[id];
    if (songs === undefined || songs.length === 0) return { status: 'unknown', heading: null, songs: [], retry: artistRetry };
    return { status: 'ready', heading: { name: names[id] ?? id, count: songs.length }, songs, retry: artistRetry };
  },
}));
const names: Record<string, string> = {};

const { SearchApp } = await import('@/components/search-app');

/** jsdom has no scrolling element and cannot follow links; stand in for both. */
beforeEach(() => {
  Object.defineProperty(document, 'scrollingElement', { configurable: true, value: document.documentElement });
  document.documentElement.scrollTop = 0;
});

/** Clicks a link; true when the app took the click over (preventDefault). The click is then stopped so jsdom does not "navigate". */
function clickLink(link: HTMLElement, init: MouseEventInit = {}): boolean {
  let takenOver = false;
  const stop = (event: Event) => {
    takenOver = event.defaultPrevented;
    event.preventDefault();
  };
  window.addEventListener('click', stop);
  fireEvent.click(link, init);
  window.removeEventListener('click', stop);
  return takenOver;
}

beforeEach(() => {
  search.current = base();
  for (const key of Object.keys(lists)) delete lists[key];
  for (const key of Object.keys(names)) delete names[key];
  pending.clear();
  retry.mockClear();
  artistRetry.mockClear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function at(url: string) {
  window.history.replaceState(null, '', url);
}
function eagles() {
  names.eagles = 'Eagles';
  lists.eagles = [hit(11, 'Desperado', 'Eagles'), hit(12, 'Dirty Laundry', 'Don Henley ft. Eagles'), hit(13, 'Hotel California', 'Eagles')];
  search.current = base({
    songs: [hit(1), hit(2)],
    total: 2,
    artists: [suggestion('eagles', 'Eagles', 3), suggestion('eagle-eye-cherry', 'Eagle-Eye Cherry', 1), suggestion('long', 'A very long artist name that cannot fit on one line of a phone', 128)],
  });
}
const artistLinks = () => screen.queryAllByRole('link');
const labels = () => screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent);

describe('artist rows (component 5)', () => {
  beforeEach(() => at('/?q=eagl'));

  it('shows each artist as a real link with name, count text and a chevron, the whole row being the link', () => {
    eagles();
    render(<SearchApp />);
    const links = artistLinks();
    expect(links.length).toBe(3);
    expect(links[0]?.getAttribute('href')).toBe('?q=eagl&artist=eagles');
    expect(links[0]?.textContent).toBe('Eagles, 3 songsEagles3 songs'); // the spoken sentence, then what is drawn
    expect(links[1]?.textContent).toBe('Eagle-Eye Cherry, 1 songEagle-Eye Cherry1 song'); // singular
    expect(links[0]?.querySelector('svg')?.getAttribute('width')).toBe('20');
    expect(links[0]?.querySelector('svg')?.getAttribute('class')).toContain('text-text-muted');
    for (const cls of ['h-16', 'px-4', 'active:bg-surface-pressed']) expect(links[0]?.className).toContain(cls);
    expect(links[0]?.parentElement?.className).toContain('border-b');
    expect(links[0]?.parentElement?.className).toContain('border-divider');
  });

  it('gives each link an accessible name "<name>, N songs" from its own text (no aria-label to disagree with what is drawn)', () => {
    eagles();
    render(<SearchApp />);
    expect(screen.getByRole('link', { name: 'Eagles, 3 songs' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Eagle-Eye Cherry, 1 song' })).toBeTruthy();
    for (const link of artistLinks()) expect(link.getAttribute('aria-label')).toBeNull();
  });

  it('the name is one line with an ellipsis; the count and chevron never shrink', () => {
    eagles();
    render(<SearchApp />);
    const row = artistLinks()[2] as HTMLElement;
    const [name, count, chevron] = [row.children[1], row.children[2], row.children[3]] as HTMLElement[];
    expect(name?.className).toContain('truncate');
    expect(name?.className).toContain('min-w-0');
    for (const cls of ['text-[17px]', 'leading-[22px]', 'font-semibold']) expect(name?.className).toContain(cls);
    for (const cls of ['text-[14px]', 'leading-5', 'text-text-secondary', 'shrink-0']) expect(count?.className).toContain(cls);
    expect(chevron?.getAttribute('class')).toContain('shrink-0');
    expect(row.className).toContain('gap-2'); // 8px between the count and the chevron
    expect(count?.textContent).toBe('128 songs');
  });

  it('labels: ARTISTS above the artists and SONGS above the songs, as 32px muted caps strips', () => {
    eagles();
    render(<SearchApp />);
    expect(labels()).toEqual(['Artists', 'Songs']);
    const label = screen.getByRole('heading', { name: 'Artists' });
    for (const cls of ['h-8', 'px-4', 'text-[12px]', 'leading-4', 'font-semibold', 'tracking-[0.08em]', 'text-text-muted', 'uppercase']) expect(label.className).toContain(cls);
    const order = [screen.getByRole('heading', { name: 'Artists' }), artistLinks()[0], screen.getByRole('heading', { name: 'Songs' }), screen.getAllByRole('listitem')[3]];
    order.forEach((el, i) => i > 0 && expect(order[i - 1]!.compareDocumentPosition(el!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
  });

  it('no artist suggested: no labels at all, only the song rows', () => {
    search.current = base({ songs: [hit(1), hit(2)], total: 2 });
    render(<SearchApp />);
    expect(labels()).toEqual([]);
    expect(artistLinks().length).toBe(0);
    expect(screen.getAllByRole('listitem').length).toBe(2);
  });

  it('artists but no songs: the artists show, with no SONGS label and no "No songs found"', () => {
    search.current = base({ artists: [suggestion('eagles', 'Eagles', 3)], total: 0, songs: [] });
    render(<SearchApp />);
    expect(artistLinks().length).toBe(1);
    expect(labels()).toEqual(['Artists']);
    expect(screen.queryByText('No songs found', { selector: 'h2' })).toBeNull();
  });

  it('both empty: the empty state, no labels', () => {
    render(<SearchApp />);
    expect(screen.getByText('No songs found', { selector: 'h2' })).toBeTruthy();
    expect(artistLinks().length).toBe(0);
  });

  it('is not shown while the song book is loading or has failed, or before typing', () => {
    search.current = base({ status: 'loading', loading: true, artists: [suggestion('eagles', 'Eagles', 3)] });
    render(<SearchApp />);
    expect(artistLinks().length).toBe(0);
    cleanup();
    at('/');
    search.current = base({ artists: [suggestion('eagles', 'Eagles', 3)] });
    render(<SearchApp />);
    expect(artistLinks().length).toBe(0);
    expect(screen.getByText('Find your song number')).toBeTruthy();
  });

  it('opens in the app on a plain click with one new history entry, and leaves a ctrl/middle click to the browser', async () => {
    eagles();
    render(<SearchApp />);
    const before = window.history.length;
    const link = artistLinks()[0] as HTMLElement;
    expect(clickLink(link, { ctrlKey: true })).toBe(false); // left to the browser (new tab)
    expect(clickLink(link, { metaKey: true })).toBe(false);
    expect(clickLink(link, { shiftKey: true })).toBe(false);
    expect(clickLink(link, { button: 1 })).toBe(false);
    expect(window.history.length).toBe(before);
    expect(screen.queryByRole('button', { name: 'Back to results' })).toBeNull();
    expect(clickLink(link)).toBe(true); // taken over: no page load
    expect(window.history.length).toBe(before + 1);
    expect(window.location.search).toBe('?q=eagl&artist=eagles');
    expect(screen.getByRole('button', { name: 'Back to results' })).toBeTruthy();
  });
});

describe('the artist view (component 6)', () => {
  it('shows the pinned box with its text, the heading block, and the full list in the engine order', async () => {
    eagles();
    at('/?q=eagl');
    render(<SearchApp />);
    await userEvent.setup().click(artistLinks()[0] as HTMLElement);
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('eagl');
    const name = screen.getByRole('heading', { level: 2, name: 'Eagles' });
    for (const cls of ['text-[24px]', 'leading-[30px]', 'font-bold', 'text-text', 'line-clamp-2']) expect(name.className).toContain(cls);
    const count = screen.getByText('3 songs');
    for (const cls of ['text-[14px]', 'leading-5', 'text-text-secondary']) expect(count.className).toContain(cls);
    const block = screen.getByRole('group', { name: 'Eagles, 3 songs' });
    for (const cls of ['min-h-[80px]', 'border-b', 'border-divider', 'bg-bg']) expect(block.className).toContain(cls);
    const back = screen.getByRole('button', { name: 'Back to results' });
    expect(back.className).toContain('size-11'); // 44x44
    expect(back.className).toContain('text-text');
    expect(back.className).toContain('focus-visible:outline-accent'); // a visible focus ring
    expect(back.querySelector('svg')?.getAttribute('width')).toBe('24');
    const list = screen.getByRole('list', { name: 'Songs by Eagles' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((li) => li.textContent)).toEqual([
      'Song 11, Desperado by Eagles11DesperadoEagles',
      'Song 12, Dirty Laundry by Don Henley ft. Eagles12Dirty LaundryDon Henley ft. Eagles', // featured credit as printed
      'Song 13, Hotel California by Eagles13Hotel CaliforniaEagles',
    ]);
    expect(rows[0]?.className).toContain('[content-visibility:auto]');
    expect(rows[0]?.className).toContain('[contain-intrinsic-size:auto_88px]');
  });

  it('has no hint row, no ARTISTS or SONGS labels, no result list, no artist links', async () => {
    eagles();
    search.current = base({ ...search.current, hasMore: true, total: 400 });
    at('/?q=eagl&artist=eagles');
    render(<SearchApp />);
    expect(screen.queryByText(/Showing the top 50/)).toBeNull();
    expect(labels()).toEqual(['Eagles']);
    expect(screen.queryByRole('list', { name: 'Song results' })).toBeNull();
    expect(artistLinks().length).toBe(0);
    expect(screen.queryByText('Find your song number')).toBeNull();
  });

  it('is open on a reload of the artist URL, with no focus stolen from the search box', () => {
    eagles();
    at('/?q=eagl&artist=eagles');
    render(<SearchApp />);
    expect(screen.getByRole('heading', { level: 2, name: 'Eagles' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
  });

  it('works with no text in the box (?artist= only)', () => {
    eagles();
    at('/?artist=eagles');
    render(<SearchApp />);
    expect(screen.getByRole('heading', { level: 2, name: 'Eagles' })).toBeTruthy();
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('Find your song number')).toBeNull();
  });

  it('a one-song artist says "1 song"', () => {
    names.solo = 'Solo';
    lists.solo = [hit(5)];
    at('/?artist=solo');
    render(<SearchApp />);
    expect(screen.getByText('1 song')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Solo, 1 song' })).toBeTruthy();
  });

  it('a long artist name is clamped to two lines and wraps anywhere', () => {
    names.long = 'W'.repeat(200);
    lists.long = [hit(5)];
    at('/?artist=long');
    render(<SearchApp />);
    const name = screen.getByRole('heading', { level: 2 });
    expect(name.className).toContain('line-clamp-2');
    expect(name.className).toContain('[overflow-wrap:anywhere]');
  });

  it('shows the loading line while the song book loads on an artist URL, and the retry on failure', () => {
    pending.add('eagles');
    search.current = base({ status: 'loading', loading: true });
    at('/?q=eagl&artist=eagles');
    render(<SearchApp />);
    expect(screen.getByRole('status').textContent).toBe('Loading song book…');
    cleanup();
    search.current = base({ status: 'error', error: LOAD_ERROR_MESSAGE });
    render(<SearchApp />);
    expect(screen.getByRole('alert').textContent).toContain(LOAD_ERROR_MESSAGE);
  });

  it('a search that failed behind the artist view does not show an error over the list', () => {
    eagles();
    search.current = base({ ...search.current, error: SEARCH_ERROR_MESSAGE });
    at('/?q=eagl&artist=eagles');
    render(<SearchApp />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Eagles' })).toBeTruthy();
  });
});

describe('leaving the artist view', () => {
  it('the back chevron goes back to the results (one Back), restores them and focuses the search box', async () => {
    eagles();
    at('/?q=eagl');
    const user = userEvent.setup();
    render(<SearchApp />);
    await user.click(artistLinks()[0] as HTMLElement);
    const length = window.history.length;
    await user.click(screen.getByRole('button', { name: 'Back to results' }));
    await waitFor(() => expect(artistLinks().length).toBe(3));
    expect(window.location.search).toBe('?q=eagl');
    expect(window.history.length).toBe(length); // back moves, never adds
    expect(labels()).toEqual(['Artists', 'Songs']);
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('eagl');
  });

  it('the browser Back button does the same, and Forward reopens the artist', async () => {
    eagles();
    at('/?q=eagl');
    const user = userEvent.setup();
    render(<SearchApp />);
    await user.click(artistLinks()[0] as HTMLElement);
    act(() => window.history.back());
    await waitFor(() => expect(artistLinks().length).toBe(3));
    expect(window.location.search).toBe('?q=eagl');
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
    act(() => window.history.forward());
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Eagles' })).toBeTruthy());
    expect(window.location.search).toBe('?q=eagl&artist=eagles');
  });

  it('opened directly on ?artist=, the chevron replaces the URL with ?q= and stays in the app', async () => {
    eagles();
    at('/?q=eagl&artist=eagles');
    const user = userEvent.setup();
    render(<SearchApp />);
    const length = window.history.length;
    const back = vi.spyOn(window.history, 'back');
    await user.click(screen.getByRole('button', { name: 'Back to results' }));
    expect(back).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?q=eagl');
    expect(window.history.length).toBe(length);
    expect(artistLinks().length).toBe(3);
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
    back.mockRestore();
  });

  it('editing the box leaves the view and shows normal results for the new text', async () => {
    eagles();
    at('/?q=eagl');
    const user = userEvent.setup();
    render(<SearchApp />);
    await user.click(artistLinks()[0] as HTMLElement);
    const length = window.history.length;
    await user.type(screen.getByRole('searchbox'), 'e');
    expect(window.location.search).toBe('?q=eagle');
    expect(window.history.length).toBe(length); // replace, no new entries
    expect(screen.queryByRole('button', { name: 'Back to results' })).toBeNull();
    expect(screen.getByRole('list', { name: 'Song results' })).toBeTruthy();
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('eagle');
  });

  it('clearing the box in the artist view goes to the home state', async () => {
    eagles();
    at('/?q=eagl');
    const user = userEvent.setup();
    render(<SearchApp />);
    await user.click(artistLinks()[0] as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(window.location.search).toBe('');
    expect(screen.getByText('Find your song number')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to results' })).toBeNull();
  });

  it('restores the scroll position of the results when going Back', async () => {
    eagles();
    at('/?q=eagl');
    const user = userEvent.setup();
    const scroller = document.scrollingElement as Element;
    render(<SearchApp />);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 });
    await user.click(artistLinks()[0] as HTMLElement);
    expect((window.history.state as { songbookFromResults?: boolean }).songbookFromResults).toBe(true);
    scroller.scrollTop = 0;
    await user.click(screen.getByRole('button', { name: 'Back to results' }));
    await waitFor(() => expect(artistLinks().length).toBe(3));
    expect(scroller.scrollTop).toBe(640);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });

  it('opening an artist starts its list at the top', async () => {
    eagles();
    at('/?q=eagl');
    const user = userEvent.setup();
    const scroller = document.scrollingElement as Element;
    render(<SearchApp />);
    scroller.scrollTop = 500;
    await user.click(artistLinks()[0] as HTMLElement);
    expect(scroller.scrollTop).toBe(0);
  });
});

describe('unknown and malformed artist ids', () => {
  for (const id of ['nobody', '%E0%A4%A', '%', 'a%2Bb', '..', 'b.o.b', '%00']) {
    it(`?artist=${id} is ignored: normal results for q, the URL is cleaned, nothing crashes`, async () => {
      eagles();
      at(`/?q=eagl&artist=${id}`);
      render(<SearchApp />);
      await waitFor(() => expect(window.location.search).toBe('?q=eagl'));
      expect(artistLinks().length).toBe(3);
      expect(screen.queryByRole('button', { name: 'Back to results' })).toBeNull();
    });
  }

  it('an unknown id with no text shows the home state', async () => {
    at('/?artist=nobody');
    render(<SearchApp />);
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(screen.getByText('Find your song number')).toBeTruthy();
  });

  it('an empty ?artist= is simply no artist', () => {
    eagles();
    at('/?q=eagl&artist=');
    render(<SearchApp />);
    expect(artistLinks().length).toBe(3);
  });
});

describe('focus and the one live region', () => {
  it('moves focus to the heading block after a tap, and its name is "<name>, N songs"', async () => {
    eagles();
    at('/?q=eagl');
    const user = userEvent.setup();
    render(<SearchApp />);
    await user.click(artistLinks()[0] as HTMLElement);
    const block = screen.getByRole('group', { name: 'Eagles, 3 songs' });
    expect(document.activeElement).toBe(block);
    expect(block.getAttribute('tabindex')).toBe('-1');
    expect(block.className).toContain('outline-none'); // reached by script, not by Tab: no ring
  });

  it('a tap moves focus to the heading and does NOT also announce it in the live region (it would be read twice)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    eagles();
    at('/?q=eagl');
    render(<SearchApp />);
    act(() => void vi.advanceTimersByTime(700));
    expect(screen.getByRole('status').textContent).toBe('2 songs found');
    fireEvent.click(artistLinks()[0] as HTMLElement);
    act(() => void vi.advanceTimersByTime(10));
    expect(screen.getAllByRole('status').length).toBe(1);
    expect(screen.getByRole('group', { name: 'Eagles, 3 songs' })).toBe(document.activeElement); // focus carries the name
    expect(screen.getByRole('status').textContent).toBe(''); // the live region stays silent
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.getByRole('status').textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Back to results' }));
    await act(async () => void vi.advanceTimersByTime(1000));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('2 songs found'));
  });

  it('where focus does not move (a direct load of the artist URL) the live region announces "<name>, N songs" once', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    eagles();
    at('/?q=eagl&artist=eagles');
    render(<SearchApp />);
    act(() => void vi.advanceTimersByTime(10));
    expect(screen.getAllByRole('status').length).toBe(1);
    expect(screen.getByRole('status').textContent).toBe('Eagles, 3 songs');
    expect(document.activeElement).not.toBe(screen.getByRole('group', { name: 'Eagles, 3 songs' }));
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.getByRole('status').textContent).toBe('Eagles, 3 songs'); // same text, not re-announced
  });

  it('keeps ul/li semantics and the per-row sentence for screen readers', () => {
    eagles();
    at('/?q=eagl&artist=eagles');
    render(<SearchApp />);
    const rows = screen.getAllByRole('listitem');
    expect(rows.length).toBe(3);
    expect(screen.getByText('Song 12, Dirty Laundry by Don Henley ft. Eagles').className).toContain('sr-only');
  });
});
