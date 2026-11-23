import { describe, expect, it } from 'vitest';
import { fitWithEllipsis } from '@/lib/fit-text';

/** A fixed-width "font": every character is 10 units wide. */
const within = (units: number) => (candidate: string) => Array.from(candidate).length * 10 <= units;

describe('fitWithEllipsis', () => {
  it('returns the text untouched when it fits', () => {
    expect(fitWithEllipsis('hello', within(50))).toBe('hello');
  });

  it('cuts to the longest start that fits with the ellipsis, leaving no slack', () => {
    const out = fitWithEllipsis('q'.repeat(200), within(55));
    expect(out).toBe(`${'q'.repeat(4)}…`);
    expect(Array.from(out).length * 10).toBeLessThanOrEqual(55);
    expect(Array.from(`${out}q`).length * 10).toBeGreaterThan(55);
  });

  it('shows just the ellipsis when nothing else fits', () => {
    expect(fitWithEllipsis('abc', within(5))).toBe('…');
  });

  it('never cuts an emoji in half', () => {
    expect(fitWithEllipsis('😀😀😀😀😀', within(30))).toBe('😀😀…');
  });
});
