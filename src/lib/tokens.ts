/**
 * Names of the design tokens defined in src/app/globals.css (the single source of values).
 * Each name maps to the CSS variable `--<name>` in both themes.
 */
export const TOKEN_NAMES = [
  'bg',
  'surface',
  'surface-pressed',
  'input-bg',
  'input-border',
  'input-border-focus',
  'divider',
  'text',
  'text-secondary',
  'text-muted',
  'accent',
  'on-accent',
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];

export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];
