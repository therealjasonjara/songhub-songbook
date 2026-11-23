// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseSearchResult } from '@/hooks/use-search';
import { LOAD_ERROR_MESSAGE } from '@/lib/search/client';
import type { SongHit } from '@/lib/search/types';

const retry = vi.fn();
const state: { current: UseSearchResult } = { current: base() };
function base(over: Partial<UseSearchResult> = {}): UseSearchResult {
  return { status: 'ready', songs: [], total: 0, hasMore: false, artists: [], loading: false, error: null, retry, ...over };
}
const hit = (n: number): SongHit => ({ n, title: `Title ${n}`, credit: 'Artist', artists: [] });
vi.mock('@/hooks/use-search', () => ({ useSearch: () => state.current }));

const { SearchApp } = await import('@/components/search-app');

beforeEach(() => {
  state.current = base();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function at(query: string) {
  window.history.replaceState(null, '', `/?q=${encodeURIComponent(query)}`);
}
const home = () => screen.queryByText('Find your song number');
const empty = () => screen.queryByText('No songs found', { selector: 'h2' });
const loadingLine = () => screen.queryByText('Loading song book…');
const rows = () => screen.queryAllByRole('listitem');
const hint = () => screen.queryByText('Showing the top 50 matches. Keep typing to narrow down.');

describe('states under the search box are mutually exclusive', () => {
  it('home: nothing typed', () => {
    render(<SearchApp />);
    expect(home()).toBeTruthy();
    expect(empty()).toBeNull();
    expect(rows().length).toBe(0);
  });

  it('loading: typed before the song book is ready', () => {
    at('hot');
    state.current = base({ status: 'loading', loading: true });
    render(<SearchApp />);
    expect(loadingLine()).toBeTruthy();
    expect([home(), empty(), hint()]).toEqual([null, null, null]);
    expect(rows().length).toBe(0);
  });

  it('error: the alert, and nothing else', () => {
    at('hot');
    state.current = base({ status: 'error', error: LOAD_ERROR_MESSAGE });
    render(<SearchApp />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect([home(), empty(), loadingLine()]).toEqual([null, null, null]);
    expect(rows().length).toBe(0);
  });

  it('a failed search (song book fine) shows the error, not the empty state', () => {
    at('hot');
    state.current = base({ error: 'Search failed.' });
    render(<SearchApp />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(empty()).toBeNull();
  });

  it('list: rows without a hint when everything fits', () => {
    at('hot');
    state.current = base({ songs: [hit(1), hit(2)], total: 2 });
    render(<SearchApp />);
    expect(rows().length).toBe(2);
    expect([home(), empty(), loadingLine(), hint()]).toEqual([null, null, null, null]);
  });

  it('list + hint when more matched', () => {
    at('love');
    state.current = base({ songs: Array.from({ length: 50 }, (_, i) => hit(i + 1)), total: 400, hasMore: true });
    render(<SearchApp />);
    expect(rows().length).toBe(50);
    expect(hint()).toBeTruthy();
    expect(empty()).toBeNull();
  });

  it('empty: only for a query that was answered with total 0, echoing the text', () => {
    at('xyzqq');
    render(<SearchApp />);
    expect(empty()).toBeTruthy();
    expect(screen.getByText('Nothing matches "xyzqq".')).toBeTruthy();
    expect([home(), loadingLine(), hint()]).toEqual([null, null, null]);
  });

  it('never shows "No songs found" for a query that has not been answered', () => {
    at('xyzqq');
    state.current = base({ loading: true, total: 0, songs: [] });
    render(<SearchApp />);
    expect(empty()).toBeNull();
  });

  it('keeps the previous rows while the next answer is on its way', () => {
    at('hotel');
    state.current = base({ loading: true, songs: [hit(1), hit(2), hit(3)], total: 3 });
    render(<SearchApp />);
    expect(rows().length).toBe(3);
    expect(empty()).toBeNull();
  });

  it('whitespace- or punctuation-only input shows home again, never "No songs found"', () => {
    for (const q of ['   ', '!!!', '? . ,', "'-'"]) {
      cleanup();
      at(q);
      render(<SearchApp />);
      expect(home(), JSON.stringify(q)).toBeTruthy();
      expect(empty(), JSON.stringify(q)).toBeNull();
    }
  });
});

describe('live region', () => {
  it('announces the result count once, after the query settles, and not before', () => {
    vi.useFakeTimers();
    at('hotel');
    state.current = base({ songs: [hit(1), hit(2)], total: 12 });
    render(<SearchApp />);
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('');
    act(() => void vi.advanceTimersByTime(300));
    expect(region.textContent).toBe('');
    act(() => void vi.advanceTimersByTime(400));
    expect(region.textContent).toBe('12 songs found');
    act(() => void vi.advanceTimersByTime(5000));
    expect(region.textContent).toBe('12 songs found');
    expect(screen.getAllByRole('status').length).toBe(1);
    expect(region.textContent).not.toContain('Title');
  });

  it('says "No songs found" and "1 song found" and stays silent while the next answer is pending', () => {
    vi.useFakeTimers();
    at('xyzqq');
    const view = render(<SearchApp />);
    act(() => void vi.advanceTimersByTime(700));
    expect(screen.getByRole('status').textContent).toBe('No songs found');
    state.current = base({ loading: true });
    view.rerender(<SearchApp />);
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByRole('status').textContent).toBe('');
    state.current = base({ songs: [hit(9)], total: 1 });
    view.rerender(<SearchApp />);
    act(() => void vi.advanceTimersByTime(700));
    expect(screen.getByRole('status').textContent).toBe('1 song found');
  });

  it('typing quickly does not announce every keystroke', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    state.current = base({ songs: [hit(1)], total: 7 });
    render(<SearchApp />);
    await user.type(screen.getByRole('searchbox'), 'love');
    expect(screen.getByRole('status').textContent).toBe('');
    act(() => void vi.advanceTimersByTime(700));
    expect(screen.getByRole('status').textContent).toBe('7 songs found');
  });
});
