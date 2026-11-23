// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongHit } from '@/lib/search/types';

const hit = (n: number, id: string, name: string): SongHit => ({ n, title: `T${n}`, credit: name, artists: [{ id, name }] });
const fake = { status: 'ready' as 'ready' | 'error', songsByArtist: vi.fn<(id: string) => Promise<SongHit[] | null>>() };
vi.mock('@/lib/search/client', () => ({ getSearchClient: () => fake }));

const { useArtistSongs } = await import('@/hooks/use-artist-songs');

beforeEach(() => {
  fake.status = 'ready';
  fake.songsByArtist.mockReset();
});

describe('useArtistSongs', () => {
  it('is idle without an artist and asks nothing', () => {
    const { result } = renderHook(() => useArtistSongs(null));
    expect(result.current.status).toBe('idle');
    expect(fake.songsByArtist).not.toHaveBeenCalled();
  });

  it('loads the list, then gives the heading (canonical name, count) and the songs in the engine order', async () => {
    fake.songsByArtist.mockResolvedValue([hit(3, 'eagles', 'Eagles'), hit(1, 'eagles', 'Eagles')]);
    const { result } = renderHook(() => useArtistSongs('eagles'));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.heading).toEqual({ name: 'Eagles', count: 2 });
    expect(result.current.songs.map((s) => s.n)).toEqual([3, 1]);
  });

  it('an id nobody has (no songs) is unknown', async () => {
    fake.songsByArtist.mockResolvedValue([]);
    const { result } = renderHook(() => useArtistSongs('nobody'));
    await waitFor(() => expect(result.current.status).toBe('unknown'));
    expect(result.current.heading).toBeNull();
  });

  it('a superseded question (null) keeps loading, and a new artist drops the old list at once', async () => {
    fake.songsByArtist.mockResolvedValueOnce([hit(1, 'a', 'A')]).mockResolvedValueOnce(null);
    const { result, rerender } = renderHook(({ id }) => useArtistSongs(id), { initialProps: { id: 'a' as string | null } });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ id: 'b' });
    expect(result.current.status).toBe('loading');
    expect(result.current.songs).toEqual([]);
    await act(async () => {});
    expect(result.current.status).toBe('loading');
  });

  it('a failed question is "failed", and retry asks again', async () => {
    fake.songsByArtist.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([hit(1, 'a', 'A')]);
    const { result } = renderHook(() => useArtistSongs('a'));
    await waitFor(() => expect(result.current.status).toBe('failed'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fake.songsByArtist).toHaveBeenCalledTimes(2);
  });

  it('a failure while the song book itself failed to load is not reported here (the search status shows it)', async () => {
    fake.status = 'error';
    fake.songsByArtist.mockRejectedValue(new Error('load'));
    const { result } = renderHook(() => useArtistSongs('a'));
    await act(async () => {});
    expect(result.current.status).toBe('loading');
  });
});
