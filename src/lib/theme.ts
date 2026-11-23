import type { Theme } from '@/lib/tokens';

/**
 * Theme for the session (PRD rule 9: not persisted, no storage, no cookies). The HTML ships with
 * `data-theme="dark"`, so there is never a flash of the wrong theme; the header toggle rewrites that one
 * attribute and the CSS variables in `globals.css` do the rest. The attribute is the single source of truth.
 */
export const THEME_ATTRIBUTE = 'data-theme';
export const DEFAULT_THEME: Theme = 'dark';

/** Page background per theme, for `<meta name="theme-color">` (same hexes as `--bg` in `globals.css`; a unit test keeps them equal). */
export const THEME_COLORS: Record<Theme, string> = { dark: '#0e0f14', light: '#faf8f5' };

export function readTheme(doc: Document = document): Theme {
  return doc.documentElement.getAttribute(THEME_ATTRIBUTE) === 'light' ? 'light' : 'dark';
}

export function nextTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

/** Sets the theme on `<html>` and keeps the browser UI colour (`theme-color` meta) in step. */
export function applyTheme(theme: Theme, doc: Document = document): void {
  doc.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
  doc.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', THEME_COLORS[theme]));
}

/** For `useSyncExternalStore`: tells React when the attribute changes. */
export function subscribeTheme(onChange: () => void, doc: Document = document): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] });
  return () => observer.disconnect();
}
