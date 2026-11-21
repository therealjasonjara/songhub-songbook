// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppHeader } from '@/components/app-header';

beforeEach(() => {
  document.documentElement.setAttribute('data-theme', 'dark');
  document.head.innerHTML = '<meta name="theme-color" content="#0e0f14">';
});
afterEach(cleanup);

describe('AppHeader layout under large text', () => {
  it('can grow and wrap the wordmark instead of colliding with the toggle', () => {
    const { container } = render(<AppHeader />);
    const header = container.querySelector('header')!;
    expect(header.className).toContain('min-h-14');
    expect(header.className).not.toMatch(/(^|\s)h-14(\s|$)/);
    expect(screen.getByRole('heading', { level: 1 }).className).not.toContain('whitespace-nowrap');
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('min-w-0');
  });
});

describe('AppHeader', () => {
  it('holds the wordmark and exactly one button: no avatar, back arrow, menu or links', () => {
    const { container } = render(<AppHeader />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(container.querySelectorAll('img, a, input')).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('SongHub Songbook');
    const [bold, light] = Array.from(screen.getByRole('heading', { level: 1 }).children);
    expect(bold?.textContent).toBe('SongHub');
    expect(bold?.className).toContain('font-extrabold');
    expect(light?.textContent).toBe(' Songbook');
    expect(light?.className).toContain('font-normal');
    expect(light?.className).toContain('text-text-secondary');
  });

  it('is 56px tall with a bottom divider and 16px insets', () => {
    render(<AppHeader />);
    const header = screen.getByRole('banner');
    for (const cls of ['h-14', 'border-b', 'border-divider', 'bg-bg', 'pl-4', 'pr-4']) expect(header.className).toContain(cls);
    expect(header.className).not.toMatch(/sticky|fixed/);
  });

  it('has a 44x44 toggle with a 24px icon that names its action', async () => {
    render(<AppHeader />);
    const toggle = screen.getByRole('button', { name: 'Switch to light theme' });
    expect(toggle.className).toContain('size-11');
    expect(toggle.className).toContain('text-text-secondary');
    expect(toggle.querySelector('svg')?.getAttribute('width')).toBe('24');
    expect(toggle.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('toggles data-theme, the label, the icon and the theme-color meta, and stores nothing', async () => {
    const user = userEvent.setup();
    render(<AppHeader />);
    const sunPath = screen.getByRole('button').innerHTML;
    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#faf8f5');
    const back = screen.getByRole('button', { name: 'Switch to dark theme' });
    expect(back.innerHTML).not.toBe(sunPath);
    await user.click(back);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeTruthy();
    expect(window.localStorage.length).toBe(0);
  });
});
