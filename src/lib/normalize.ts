/**
 * Text normalisation shared by the artist merge (T003) and the search index (T004).
 * Business rule 1: lowercase, strip diacritics, drop apostrophes/quotes/brackets/punctuation,
 * `&` and `and` alike, underscores as spaces, collapse whitespace. Pure: no Node APIs.
 *
 * - apostrophes and quotes are dropped without a gap: `I've` -> `ive`
 * - dots are dropped without a gap: `R.E.M.` -> `rem`
 * - every other non-letter/digit (brackets, hyphen, comma, slash, `_`, damage such as `¬`) is a space
 * - `&` becomes `and`, so `Ben&Ben` and `Ben and Ben` are the same
 */
const LETTER_FIXES: Record<string, string> = {
  ø: 'o',
  đ: 'd',
  ł: 'l',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ı: 'i',
};

export function normalize(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[øđłßæœı]/g, (c) => LETTER_FIXES[c] ?? c)
    .replace(/&/g, ' and ')
    .replace(/['’‘`´"“”„«».]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
