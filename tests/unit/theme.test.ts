// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, nextTheme, readTheme, THEME_COLORS } from '@/lib/theme';

const css = readFileSync('src/app/globals.css', 'utf8');

describe('theme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.head.innerHTML = '<meta name="theme-color" content="#0e0f14">';
  });

  it('is dark unless the attribute says light (the system setting is ignored)', () => {
    expect(readTheme()).toBe('dark');
    document.documentElement.setAttribute('data-theme', 'light');
    expect(readTheme()).toBe('light');
    document.documentElement.setAttribute('data-theme', 'sepia');
    expect(readTheme()).toBe('dark');
  });

  it('applyTheme sets data-theme and the theme-color meta, and stores nothing', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#faf8f5');
    expect(window.localStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    expect(nextTheme('light')).toBe('dark');
  });

  it('theme-color values equal the page background token of each theme', () => {
    expect(css).toMatch(new RegExp(`:root \\{[^}]*--bg: ${THEME_COLORS.dark};`));
    expect(css).toMatch(new RegExp(`\\[data-theme='light'\\] \\{[^}]*--bg: ${THEME_COLORS.light};`));
  });
});
