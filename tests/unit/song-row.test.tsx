// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { NoResults } from '@/components/no-results';
import { ResultsList } from '@/components/results-list';
import { SongRow, type SongRowProps, sameRow, songRowLabel } from '@/components/song-row';
import type { SongHit } from '@/lib/search/types';

afterEach(cleanup);

const hit = (n: number, title = `Title ${n}`, credit = 'Artist'): SongHit => ({ n, title, credit, artists: [] });

function renderRow(song: SongHit) {
  render(
    <ul>
      <SongRow song={song} />
    </ul>,
  );
  return screen.getByRole('listitem');
}

describe('SongRow', () => {
  it('is an 88px-minimum list item (grows only with larger text) with 16px side padding, a hairline divider and a pressed surface', () => {
    const li = renderRow(hit(36527));
    expect(li.className).not.toMatch(/(^| )h-\[88px\]/); // a hard 88px would clip enlarged text
    for (const c of ['min-h-[88px]', 'py-2', 'w-full', 'px-4', 'border-b', 'border-divider', 'active:bg-surface-pressed']) expect(li.className).toContain(c);
  });

  it('shows the number at 36/40 800 accent, tabular, in a column that is at least 136px, grows with the number and never wraps', () => {
    renderRow(hit(36527));
    const number = screen.getByText('36527');
    for (const c of ['min-w-[136px]', 'w-auto', 'shrink-0', 'text-[36px]', 'leading-10', 'font-extrabold', 'text-accent', 'tabular-nums', 'tracking-[-0.01em]', 'whitespace-nowrap', 'text-left']) {
      expect(number.className).toContain(c);
    }
  });

  it('fits 1-digit and 5-digit numbers without any special case', () => {
    for (const n of [1, 99999]) {
      cleanup();
      renderRow(hit(n));
      expect(screen.getByText(String(n)).className).toContain('whitespace-nowrap');
    }
  });

  it('sets the title at 17/22 600 and keeps the text block able to shrink so it never pushes the number', () => {
    renderRow(hit(1, 'Some title', 'Some artist'));
    const title = screen.getByText('Some title');
    for (const c of ['text-[17px]', 'leading-[22px]', 'font-semibold', 'text-text']) expect(title.className).toContain(c);
    const block = title.parentElement as HTMLElement;
    for (const c of ['min-w-0', 'flex-1', 'flex-col', 'justify-center']) expect(block.className).toContain(c);
  });

  it('puts 2px between the title and the artist, and the artist at 14/20 400 secondary', () => {
    renderRow(hit(1, 'Some title', 'Some artist'));
    const artist = screen.getByText('Some artist');
    for (const c of ['mt-0.5', 'text-[14px]', 'leading-5', 'font-normal', 'text-text-secondary']) expect(artist.className).toContain(c);
  });

  it('clamps a long title to 2 lines and a long artist to 1 line', () => {
    renderRow(hit(1, 'A very long song title '.repeat(10), 'An artist credit that is also far too long '.repeat(5)));
    expect(screen.getByText(/^A very long song title/).className).toContain('line-clamp-2');
    const artist = screen.getByText(/^An artist credit/);
    expect(artist.className).toContain('truncate');
    expect(artist.className).toContain('text-[14px]');
  });

  it('shows a featured credit exactly as printed', () => {
    const credit = 'Logic ft. Alessia Cara & Khalid';
    renderRow(hit(2, ' 1-800-273-8255', credit));
    expect(screen.getByText(credit)).toBeTruthy();
  });

  it('shows nothing for an empty credit (no invented text)', () => {
    const li = renderRow(hit(3, 'Solo', ''));
    expect(li.textContent).toBe('Song 3, Solo3Solo');
    expect(screen.queryByText('Unknown')).toBeNull();
    expect(li.querySelectorAll('.truncate').length).toBe(0);
  });

  it('is not a control: no button, link, tabindex or click handler', () => {
    const li = renderRow(hit(4));
    expect(li.querySelector('button, a, input, [tabindex], [role="button"]')).toBeNull();
    expect(li.hasAttribute('tabindex')).toBe(false);
    expect(li.getAttribute('onclick')).toBeNull();
  });

  it('reads the number first for assistive technology', () => {
    expect(songRowLabel(hit(36527, 'Hello', 'Adele'))).toBe('Song 36527, Hello by Adele');
    expect(songRowLabel(hit(5, 'Hello', ''))).toBe('Song 5, Hello');
    const li = renderRow(hit(36527, 'Hello', 'Adele'));
    expect(li.querySelector('.sr-only')?.textContent).toBe('Song 36527, Hello by Adele');
    expect(li.querySelectorAll('[aria-hidden="true"]').length).toBe(2);
  });
});

describe('ResultsList', () => {
  const songs = Array.from({ length: 50 }, (_, i) => hit(1000 + i));

  it('renders one row per song in a list', () => {
    render(<ResultsList songs={songs} hasMore={false} />);
    expect(screen.getByRole('list', { name: 'Song results' })).toBeTruthy();
    expect(screen.getAllByRole('listitem').length).toBe(50);
  });

  it('shows the 64px hint row only when more matched', () => {
    const { rerender } = render(<ResultsList songs={songs} hasMore={false} />);
    expect(screen.queryByText('Showing the top 50 matches. Keep typing to narrow down.')).toBeNull();
    rerender(<ResultsList songs={songs} hasMore />);
    const hint = screen.getByText('Showing the top 50 matches. Keep typing to narrow down.');
    for (const c of ['min-h-16', 'text-center', 'text-[14px]', 'leading-5', 'text-text-muted']) expect(hint.className).toContain(c);
  });

  it('renders nothing when there are no songs', () => {
    const { container } = render(<ResultsList songs={[]} hasMore={false} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('NoResults', () => {
  it('has the spec copy and echoes the typed text', () => {
    const { container } = render(<NoResults query="xyzq" />);
    expect(screen.getByRole('heading', { level: 2, name: 'No songs found' })).toBeTruthy();
    expect(container.textContent).toContain('Nothing matches "xyzq".');
    expect(screen.getByText('Check the spelling, or try fewer words.')).toBeTruthy();
    expect(container.querySelector('button, a')).toBeNull();
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('48');
  });

  it('keeps the echo on one line and clipped (the ellipsis itself is measured in the browser: see the e2e smoke)', () => {
    const query = 'q'.repeat(200);
    const { container } = render(<NoResults query={query} />);
    const echo = container.querySelector('p') as HTMLElement;
    for (const c of ['whitespace-nowrap', 'overflow-hidden', 'min-w-0', 'max-w-full']) expect(echo.className).toContain(c);
    expect(echo.textContent).toBe(`Nothing matches "${query}".`); // jsdom has no layout: nothing to cut
  });
});

describe('SongRow memo', () => {
  /** Counts renders by wrapping the memoised function (a render is one call of it). */
  function countRenders(): { count: () => number; restore: () => void } {
    const memo = SongRow as unknown as { type: (props: SongRowProps) => ReactNode };
    const original = memo.type;
    let renders = 0;
    memo.type = (props) => {
      renders += 1;
      return original(props);
    };
    return { count: () => renders, restore: () => void (memo.type = original) };
  }
  const list = (ns: number[]) => ns.map((n) => hit(n));

  it('compares rows by number, title and credit only', () => {
    expect(sameRow({ song: hit(1, 'a', 'b') }, { song: hit(1, 'a', 'b') })).toBe(true);
    expect(sameRow({ song: hit(1, 'a', 'b') }, { song: hit(2, 'a', 'b') })).toBe(false);
    expect(sameRow({ song: hit(1, 'a', 'b') }, { song: hit(1, 'x', 'b') })).toBe(false);
    expect(sameRow({ song: hit(1, 'a', 'b') }, { song: hit(1, 'a', 'x') })).toBe(false);
    // fields a row does not draw do not matter
    expect(sameRow({ song: { ...hit(1), artists: [{ id: 'a', name: 'A' }] } }, { song: { ...hit(1), artists: [{ id: 'b', name: 'B' }] } })).toBe(true);
  });

  it('re-renders only the 10 new rows when 40 shared rows arrive as new cloned objects', () => {
    const counter = countRenders();
    try {
      const first = list(Array.from({ length: 50 }, (_, i) => i + 1));
      const { rerender } = render(<ResultsList songs={first} hasMore={false} />);
      expect(counter.count()).toBe(50);
      // Songs 11..50 again (a worker reply is a structured clone: new objects), then 10 never seen before.
      const next = [...structuredClone(first.slice(10)), ...list(Array.from({ length: 10 }, (_, i) => 101 + i))];
      expect(next[0]).not.toBe(first[10]);
      rerender(<ResultsList songs={next} hasMore={false} />);
      expect(counter.count()).toBe(50 + 10);
      expect(screen.getAllByRole('listitem').length).toBe(50);
    } finally {
      counter.restore();
    }
  });

  it('re-renders a row whose title changed even though its number did not', () => {
    const counter = countRenders();
    try {
      const { rerender } = render(<ResultsList songs={[hit(1, 'Old')]} hasMore={false} />);
      rerender(<ResultsList songs={[hit(1, 'New')]} hasMore={false} />);
      expect(counter.count()).toBe(2);
      expect(screen.getByText('New')).toBeTruthy();
    } finally {
      counter.restore();
    }
  });
});

describe('ResultsList keys', () => {
  it('keys rows by song number: a reordered answer moves the same DOM nodes instead of rewriting them', () => {
    const { rerender } = render(<ResultsList songs={[hit(1), hit(2), hit(3)]} hasMore={false} />);
    const nodeFor = (n: number) => screen.getByText(`Song ${n}, Title ${n} by Artist`, { selector: '.sr-only' }).parentElement;
    const before = new Map([1, 2, 3].map((n) => [n, nodeFor(n)]));
    rerender(<ResultsList songs={[hit(3), hit(1), hit(2), hit(4)]} hasMore={false} />);
    for (const n of [1, 2, 3]) expect(nodeFor(n), `song ${n}`).toBe(before.get(n));
    expect(screen.getAllByRole('listitem').map((li) => li.querySelector('.sr-only')?.textContent)).toEqual([
      'Song 3, Title 3 by Artist',
      'Song 1, Title 1 by Artist',
      'Song 2, Title 2 by Artist',
      'Song 4, Title 4 by Artist',
    ]);
  });
});
