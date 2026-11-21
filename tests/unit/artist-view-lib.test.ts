import { describe, expect, it } from 'vitest';
import { artistHeading, artistLabel, formatSongCount } from '@/lib/artist-view';
import type { SongHit } from '@/lib/search/types';

const hit = (n: number, artists: { id: string; name: string }[]): SongHit => ({ n, title: `Title ${n}`, credit: 'x', artists });

describe('formatSongCount / artistLabel', () => {
  it('uses the singular for exactly one song', () => {
    expect(formatSongCount(1)).toBe('1 song');
    expect(formatSongCount(0)).toBe('0 songs');
    expect(formatSongCount(2)).toBe('2 songs');
    expect(formatSongCount(568)).toBe('568 songs');
    expect(formatSongCount(1204)).toBe('1,204 songs');
  });

  it('reads name then count', () => {
    expect(artistLabel('Eagles', 128)).toBe('Eagles, 128 songs');
    expect(artistLabel('Mia', 1)).toBe('Mia, 1 song');
  });
});

describe('artistHeading', () => {
  it('takes the canonical name from the song list and counts every song, featured ones included', () => {
    const songs = [hit(1, [{ id: 'eagles', name: 'Eagles' }]), hit(2, [{ id: 'don-henley', name: 'Don Henley' }, { id: 'eagles', name: 'Eagles' }])];
    expect(artistHeading(songs, 'eagles')).toEqual({ name: 'Eagles', count: 2 });
  });

  it('is null for an empty list or an id nobody on the first song carries', () => {
    expect(artistHeading([], 'eagles')).toBeNull();
    expect(artistHeading([hit(1, [{ id: 'a', name: 'A' }])], 'eagles')).toBeNull();
    expect(artistHeading([hit(1, [])], 'eagles')).toBeNull();
  });
});
