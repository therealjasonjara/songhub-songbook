// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseSearchResult } from '@/hooks/use-search';
import { LOAD_ERROR_MESSAGE } from '@/lib/search/client';

const retry = vi.fn();
const state: { current: UseSearchResult } = { current: base() };
function base(over: Partial<UseSearchResult> = {}): UseSearchResult {
  return { status: 'loading', songs: [], total: 0, hasMore: false, artists: [], loading: false, error: null, retry, ...over };
}
vi.mock('@/hooks/use-search', () => ({ useSearch: () => state.current }));

const { SearchApp } = await import('@/components/search-app');

beforeEach(() => {
  state.current = base();
  retry.mockClear();
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

describe('home state', () => {
  it('shows the spec copy and the 48px accent note before typing', () => {
    render(<SearchApp />);
    expect(screen.getByRole('heading', { level: 2, name: 'Find your song number' })).toBeTruthy();
    expect(screen.getByText('Type a song title or an artist.')).toBeTruthy();
    expect(screen.getByText('About 47,000 songs')).toBeTruthy();
    const note = screen.getByRole('heading', { level: 2 }).parentElement?.querySelector('svg');
    expect(note?.getAttribute('width')).toBe('48');
    expect(note?.getAttribute('class')).toContain('text-accent');
    expect(screen.queryByText('Loading song book…')).toBeNull(); // nothing typed: no loading line even though the book is loading
  });

  it('is replaced once the guest types', async () => {
    const user = userEvent.setup();
    state.current = base({ status: 'ready' });
    render(<SearchApp />);
    await user.type(screen.getByRole('searchbox'), 'a');
    expect(screen.queryByText('Find your song number')).toBeNull();
  });
});

describe('loading and error', () => {
  it('shows the loading line only when typed before the data was ready', async () => {
    const user = userEvent.setup();
    render(<SearchApp />);
    expect(screen.getByRole('status').textContent).toBe('');
    await user.type(screen.getByRole('searchbox'), 'hot');
    expect(screen.getByRole('status').textContent).toBe('Loading song book…');
  });

  it('shows no loading line when the data is ready', async () => {
    const user = userEvent.setup();
    state.current = base({ status: 'ready', loading: true });
    render(<SearchApp />);
    await user.type(screen.getByRole('searchbox'), 'hot');
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('shows the exact error and a working Try again button, in place of the home copy', async () => {
    const user = userEvent.setup();
    state.current = base({ status: 'error', error: LOAD_ERROR_MESSAGE });
    render(<SearchApp />);
    expect(screen.getByRole('alert').textContent).toContain("Couldn't load the song book. Check your connection and try again.");
    expect(screen.queryByText('Find your song number')).toBeNull();
    const button = screen.getByRole('button', { name: 'Try again' });
    expect(button.className).toContain('h-12');
    await user.click(button);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('query in the URL', () => {
  it('starts from ?q= on load', async () => {
    window.history.replaceState(null, '', '/?q=hotel+californa');
    render(<SearchApp />);
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('hotel californa');
    expect(screen.queryByText('Find your song number')).toBeNull();
  });

  it('mirrors typing with replaceState (no new history entries) and removes q when cleared', async () => {
    const user = userEvent.setup();
    const length = window.history.length;
    const push = vi.spyOn(window.history, 'pushState');
    render(<SearchApp />);
    await user.type(screen.getByRole('searchbox'), 'a b');
    expect(window.location.search).toBe('?q=a+b');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(window.location.search).toBe('');
    expect(window.history.length).toBe(length);
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it('follows back/forward (popstate)', async () => {
    render(<SearchApp />);
    act(() => {
      window.history.replaceState(null, '', '/?q=eagles');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByDisplayValue('eagles')).toBeTruthy();
    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('Find your song number')).toBeTruthy();
  });
});
