import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEMES, TOKEN_NAMES } from '@/lib/tokens';

const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(selector + ' {');
  expect(start, `${selector} block exists`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

describe('design tokens', () => {
  const blocks = { dark: block(':root'), light: block("[data-theme='light']") };

  it.each(THEMES)('defines every token in the %s theme', (theme) => {
    for (const name of TOKEN_NAMES) {
      expect(blocks[theme]).toMatch(new RegExp(`--${name}:\\s*#[0-9a-f]{6};`));
    }
  });

  it('uses the spec accent for each theme, not the Stitch value', () => {
    expect(blocks.dark).toContain('--accent: #ffc933');
    expect(blocks.light).toContain('--accent: #9a4300');
    expect(css).not.toContain('#f4bf28');
  });
});
