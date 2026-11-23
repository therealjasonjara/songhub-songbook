/** WCAG 2.x contrast maths for `rgb()` / `rgba()` strings as the browser reports computed colours. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(css: string): Rgb {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(css.trim());
  if (!m) throw new Error(`cannot parse colour "${css}" (expected rgb/rgba)`);
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: alpha };
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(c: Rgb): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** Contrast ratio of two opaque colours, 1..21. */
export function contrast(foreground: string, background: string): number {
  const a = luminance(parseColor(foreground));
  const b = luminance(parseColor(background));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** The spec table quotes one decimal; a measured value meets it when it rounds to at least that. */
export const roundedAtLeast = (measured: number, spec: number): boolean => Math.round(measured * 10) / 10 >= spec;
