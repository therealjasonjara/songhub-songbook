// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { SearchBox } from '@/components/search-box';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <SearchBox value={value} onChange={setValue} />;
}
afterEach(cleanup);

describe('SearchBox', () => {
  it('is a labelled search field with the mobile keyboard attributes', () => {
    render(<Harness />);
    const input = screen.getByRole('searchbox', { name: 'Search song or artist' }) as HTMLInputElement;
    expect(input.type).toBe('search');
    expect(input.getAttribute('inputmode')).toBe('search');
    expect(input.getAttribute('enterkeyhint')).toBe('search');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('autocorrect')).toBe('off');
    expect(input.getAttribute('autocapitalize')).toBe('none');
    expect(input.getAttribute('spellcheck')).toBe('false');
    expect(input.placeholder).toBe('Search song or artist');
    expect(document.activeElement).toBe(input); // autofocus
  });

  it('uses the spec sizes: 72px sticky strip, 56px field, radius 16, 18px text, text starts 52px in', () => {
    const { container } = render(<Harness />);
    const strip = screen.getByRole('search');
    for (const cls of ['sticky', 'top-0', 'h-[72px]', 'py-2', 'px-4', 'bg-bg']) expect(strip.className).toContain(cls);
    const field = strip.firstElementChild as HTMLElement;
    expect(field.className).toContain('h-14');
    expect(field.className).toContain('rounded-input');
    const input = screen.getByRole('searchbox');
    expect(input.className).toContain('text-[18px]');
    expect(input.className).toContain('pl-[52px]');
    expect(input.className).toContain('placeholder:text-text-muted');
    const border = container.querySelector('[aria-hidden="true"].border');
    expect(border?.className).toContain('border-input-border');
    expect(border?.className).toContain('peer-focus:border-2');
    expect(border?.className).toContain('peer-focus:border-input-border-focus');
    expect(border?.className).not.toMatch(/blue/);
    const magnifier = strip.querySelector('svg');
    expect(magnifier?.getAttribute('width')).toBe('24');
    expect(magnifier?.getAttribute('class')).toContain('text-text-muted');
  });

  it('shows the clear button only when there is text; it is 48x48, inside the field, with a 20px icon', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    await user.type(screen.getByRole('searchbox'), 'hot');
    const clear = screen.getByRole('button', { name: 'Clear search' });
    expect(clear.className).toContain('size-12');
    expect(clear.className).toContain('right-1'); // 4px inside the field edge: never clipped
    expect(clear.className).toContain('text-text-secondary');
    expect(clear.querySelector('svg')?.getAttribute('width')).toBe('20');
    expect(clear.getAttribute('type')).toBe('button');
  });

  it('clearing empties the box and keeps focus in it', async () => {
    const user = userEvent.setup();
    render(<Harness initial="hotel" />);
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });
});
