/** The one sentence a screen reader hears when a search settles (never one line per row). */
export function resultAnnouncement(total: number): string {
  if (total <= 0) return 'No songs found';
  const count = total.toLocaleString('en-US');
  return total === 1 ? '1 song found' : `${count} songs found`;
}

/** True when the typed text has something to search for: whitespace- or punctuation-only input counts as nothing typed. */
export function hasSearchableText(query: string, normalize: (text: string) => string): boolean {
  return normalize(query) !== '';
}
