/**
 * The longest start of `text` that still fits once an ellipsis is added, or `text` itself when it all fits.
 * `fits` answers whether a candidate string fits the line (the caller measures it). Counts whole characters, so an
 * emoji is never cut in half. Never returns less than the ellipsis alone.
 */
export function fitWithEllipsis(text: string, fits: (candidate: string) => boolean): string {
  if (fits(text)) return text;
  const chars = Array.from(text);
  let low = 0; // always fits (just the ellipsis, or nothing fits at all and we show it anyway)
  let high = chars.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(`${chars.slice(0, mid).join('')}…`)) low = mid;
    else high = mid - 1;
  }
  return `${chars.slice(0, low).join('')}…`;
}
