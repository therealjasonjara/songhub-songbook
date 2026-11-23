import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/* jsdom cannot see pseudo-element rules, so assert the rule text itself: the browser's own search cancel button must stay hidden, otherwise a guest sees two clear (X) buttons. */
describe('global CSS rules jsdom cannot render', () => {
  const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');

  it("hides the browser's own search cancel button and decorations", () => {
    for (const pseudo of ['search-cancel-button', 'search-decoration', 'search-results-button', 'search-results-decoration']) {
      expect(css).toContain(`input[type='search']::-webkit-${pseudo}`);
    }
    const block = css.slice(css.indexOf("input[type='search']::-webkit-search-cancel-button"));
    expect(block.slice(0, block.indexOf('}'))).toMatch(/display:\s*none/);
  });
});
