import { normalize } from '../../src/lib/normalize.ts';
import type { Artist, Dataset, Song } from '../../src/lib/dataset.ts';

export interface RawSong {
  n: number;
  t: string;
  a: string;
}

/** A client-approved merge (data/artist-merges.json). `ids`/`names` are merged into `into`. */
export interface MergeRule {
  ids?: string[];
  names?: string[];
  into: string;
}

/** A client instruction to keep spellings apart that would otherwise merge on their normalised key. */
export interface KeepSeparateRule {
  keepSeparate: string[];
}
export type MergeEntry = MergeRule | KeepSeparateRule;

export const UNKNOWN = 'Unknown';
const FEAT = /\b(?:featuring|feat|ft)\b\.?/gi;
/** A marker glued to the end of the previous word: `Horizonft. Lil Uzi Vert`. Case-sensitive on purpose (capital check). */
const GLUED_FEAT = /(\p{L}{4,})(?:ft|feat)\.(?=\s+\p{Lu})/gu;
const GLUED_SPLIT = '\u0000';
const TRAILING_MARKER = /^(.*\S)[\s,;&+(\[-]*\b(?:featuring|feat|ft)\b(\.*)$/i;

/** Trim a name part: whitespace, truncation marks (`...`), dangling separators and unmatched brackets. */
export function cleanName(s: string): string {
  let r = s.replace(/\s+/g, ' ').trim();
  for (;;) {
    const before = r;
    r = r
      .replace(/(?:\.{2,}|…)$/, '')
      .replace(/[\s&+,;\-(\[/]+$/, '')
      .replace(/^[\s,;&+)\]-]+/, '')
      .trim();
    if (r.endsWith(')') && !r.includes('(')) r = r.slice(0, -1).trim();
    if (r.endsWith(']') && !r.includes('[')) r = r.slice(0, -1).trim();
    if (r === before) return r;
  }
}

export function looksTruncated(credit: string): boolean {
  return /(?:\.{3}|…)\s*$/.test(credit) || /[&+,]\s*$/.test(credit);
}

export interface ParsedCredit {
  /** Artist names the song is listed under, main artist first. */
  names: string[];
  /** `split`: featured markers found and applied; `guard`: markers found, not applied; `none`: no markers. */
  kind: 'none' | 'split' | 'guard';
  guardReason?: string;
  emptyCredit: boolean;
}

/**
 * Split a printed credit on ft / ft. / feat / feat. / featuring only (A-003). Never on `&`, `+`, `and`, `,`
 * or `with`. If the main part or any part is empty the credit is not split.
 */
export function parseCredit(credit: string): ParsedCredit {
  const whole = cleanName(credit);
  const emptyCredit = normalize(whole) === '';
  // glued `ft.`: only when the stem is 4+ letters (so `Daft. Punk` stays whole), the dot is present and a
  // capital follows after a space (so `Draft.Beat` stays whole)
  const text = credit.replace(GLUED_FEAT, (_m, stem: string) => `${stem}${GLUED_SPLIT}`);
  const pieces = text.split(new RegExp(`${FEAT.source}|${GLUED_SPLIT}`, 'gi'));
  if (pieces.length < 2) return { names: [emptyCredit ? UNKNOWN : whole], kind: 'none', emptyCredit };
  const parts = pieces.map((p, i) => {
    // a marker opened inside brackets ends the featured name at the closing bracket: `(Feat. Kaliii)From Bar`
    const before = pieces[i - 1] ?? '';
    if (i > 0 && (count(before, '(') > count(before, ')') || count(before, '[') > count(before, ']'))) {
      return cleanName(p.split(/[)\]]/)[0] ?? '');
    }
    return cleanName(p);
  });
  if (parts.some((p) => normalize(p) === '')) {
    const reason = normalize(parts[0] ?? '') === '' ? 'main artist part is empty' : 'a featured part is empty';
    return { names: [guardedName(credit, whole, pieces.length)], kind: 'guard', guardReason: reason, emptyCredit };
  }
  return { names: parts, kind: 'split', emptyCredit: false };
}

/** Credits worth listing for the client: marker glued to a word (`Horizonft.`) or `(feat. X)Title`. */
const EDGE = /\p{L}(?:ft|feat)\.|[(\[]\s*(?:featuring|feat|ft)\b[^)\]]*[)\]]\S/iu;

function count(s: string, ch: string): number {
  return s.split(ch).length - 1;
}

/**
 * Name for a credit kept whole because a part was empty. A trailing ft/feat/featuring marker left over from a
 * cut-off credit is dropped (`Imanbek ft...`, `X feat. Y feat. ...`) but only when it is clearly a marker: it
 * has a dot or ellipsis after it, the credit has another marker, or the credit looks cut off. `Little Feat` stays.
 */
function guardedName(credit: string, whole: string, pieceCount: number): string {
  let name = whole;
  const m = TRAILING_MARKER.exec(name);
  if (m && ((m[2] ?? '') !== '' || pieceCount > 2 || looksTruncated(credit))) name = cleanName(m[1] ?? '');
  return normalize(name) === '' ? UNKNOWN : name;
}

export function slug(key: string): string {
  return key.replace(/ /g, '-');
}

/** Separated spellings get a unit key `plainKey\u0001spelling`; everything else is just the normalised key. */
const SEP = '\u0001';
/** Case, spacing and trailing dots do not make a spelling distinct for `keepSeparate`: `B.O.B` and `B.O.B.` are one. */
export const spellingKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase().replace(/[.\s]+$/, '');
/** Id slug of a unit key: the normalised key, or for a separated spelling its lowercased spelling (dots kept). */
const unitSlug = (unit: string) => {
  const i = unit.indexOf(SEP);
  return i < 0 ? slug(unit) : unit.slice(i + 1).replace(/\s+/g, '-');
};

export interface MergeIssue {
  rule: number;
  message: string;
}

export interface CreditStat {
  credit: string;
  songs: number;
}

export interface MergedVariant {
  spelling: string;
  songs: number;
  examples: string[];
}
export interface MergedGroup {
  name: string;
  aliases: string[];
  count: number;
  variants: MergedVariant[];
}

export interface BuildDiagnostics {
  distinctCredits: number;
  distinctSpellings: number;
  artistsBeforeMerge: number;
  artistsAfterMerge: number;
  /** Groups of >1 distinct spelling merged automatically, biggest first. */
  mergedGroups: MergedGroup[];
  /** Songs listed under `Unknown`, by the credit as printed (`''` for an empty credit). */
  unknownCredits: CreditStat[];
  /** Number of `keepSeparate` groups that were applied. */
  appliedSeparations: number;
  /** Credits with a marker glued to a word, or a marker closed by a bracket and followed by text: what was done. */
  edgeCredits: (CreditStat & { outcome: string })[];
  songsWithFeatured: number;
  emptyCreditSongs: number;
  withCredits: CreditStat[];
  truncatedCredits: (CreditStat & { cleaned: string })[];
  splitGuards: (CreditStat & { reason: string })[];
  mergeIssues: MergeIssue[];
  appliedMerges: number;
}

export interface BuildResult {
  dataset: Dataset;
  diagnostics: BuildDiagnostics;
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function tally(map: Map<string, number>): CreditStat[] {
  return [...map.entries()]
    .map(([credit, songs]) => ({ credit, songs }))
    .sort((x, y) => y.songs - x.songs || cmpStr(x.credit, y.credit));
}


const isKeepSeparate = (e: unknown): e is KeepSeparateRule =>
  typeof e === 'object' && e !== null && 'keepSeparate' in e;

/**
 * Apply `keepSeparate` entries. A listed name selects the spelling (compared case-insensitively, whitespace
 * collapsed); a listed id selects whatever is left of that artist once the listed names are taken out. Every
 * listed name becomes its own unit. Returns plainKey -> lowercased spelling -> unit key.
 */
function resolveSeparations(
  entries: MergeEntry[],
  plain: Map<string, Map<string, number>>,
  issues: MergeIssue[],
): { units: Map<string, Map<string, string>>; applied: number } {
  const units = new Map<string, Map<string, string>>();
  const keyOfSpelling = new Map<string, string>();
  const keyOfId = new Map<string, string>();
  for (const [k, sp] of plain) {
    keyOfId.set(slug(k), k);
    for (const s of sp.keys()) keyOfSpelling.set(spellingKey(s), k);
  }
  let applied = 0;
  entries.forEach((e, i) => {
    if (!isKeepSeparate(e)) return;
    const no = i + 1;
    if (!Array.isArray(e.keepSeparate) || e.keepSeparate.length < 2 || e.keepSeparate.some((x) => typeof x !== 'string' || x.trim() === '')) {
      issues.push({ rule: no, message: '"keepSeparate" must be a list of at least two names or ids' });
      return;
    }
    const names = new Map<string, string>(); // lower spelling -> plain key
    let remainderKey: string | undefined;
    let remainders = 0;
    let bad = false;
    for (const item of e.keepSeparate) {
      const low = spellingKey(item);
      const byName = keyOfSpelling.get(low);
      if (byName !== undefined) {
        names.set(low, byName);
        continue;
      }
      const byId = keyOfId.get(item.trim());
      if (byId !== undefined) {
        remainderKey = byId;
        remainders++;
        continue;
      }
      issues.push({ rule: no, message: `no artist or id "${item}" to keep separate` });
      bad = true;
    }
    if (bad) return;
    const keys = new Set([...names.values(), ...(remainderKey === undefined ? [] : [remainderKey])]);
    if (keys.size !== 1) {
      issues.push({ rule: no, message: 'the listed names are different artists already; nothing to keep separate' });
      return;
    }
    if (names.size + remainders < 2 || remainders > 1) {
      issues.push({ rule: no, message: 'needs at least two distinct spellings of the same artist' });
      return;
    }
    const k = [...keys][0] as string;
    const m = units.get(k) ?? new Map<string, string>();
    for (const low of names.keys()) m.set(low, `${k}${SEP}${low}`);
    units.set(k, m);
    applied++;
  });
  return { units, applied };
}

/** Resolve approved merges to a unit key -> target key map. */
function resolveMerges(
  entries: MergeEntry[],
  idToKey: Map<string, string>,
  keys: Set<string>,
  unitOf: (name: string) => string,
  issues: MergeIssue[],
): { target: Map<string, string>; display: Map<string, string>; applied: number } {
  const target = new Map<string, string>();
  const display = new Map<string, string>();
  let applied = 0;
  entries.forEach((rule, i) => {
    if (isKeepSeparate(rule)) return;
    const no = i + 1;
    if (typeof rule !== 'object' || rule === null || typeof rule.into !== 'string' || normalize(rule.into) === '') {
      issues.push({ rule: no, message: 'missing or empty "into"' });
      return;
    }
    const into = unitOf(rule.into);
    const sources: string[] = [];
    for (const id of rule.ids ?? []) {
      const k = idToKey.get(id);
      if (k === undefined) issues.push({ rule: no, message: `unknown artist id "${id}"` });
      else sources.push(k);
    }
    for (const name of rule.names ?? []) {
      const k = unitOf(name);
      if (!keys.has(k)) issues.push({ rule: no, message: `no artist named "${name}"` });
      else sources.push(k);
    }
    if (sources.length === 0 && !keys.has(into)) {
      issues.push({ rule: no, message: `nothing to merge into "${rule.into}"` });
      return;
    }
    for (const s of sources) if (s !== into) target.set(s, into);
    display.set(into, rule.into.trim());
    applied++;
  });
  // follow chains, guard against cycles
  const final = (k: string): string => {
    const seen = new Set<string>();
    let cur = k;
    while (target.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = target.get(cur) as string;
    }
    return cur;
  };
  const resolved = new Map<string, string>();
  for (const k of target.keys()) resolved.set(k, final(k));
  const resolvedDisplay = new Map<string, string>();
  for (const [k, v] of display) resolvedDisplay.set(final(k), v);
  return { target: resolved, display: resolvedDisplay, applied };
}

/**
 * Stable ids: the slug of the unit key, in key order, with `-2`, `-3` on a collision. Plain keys cannot collide
 * (normalised keys contain no hyphen, so the slug is one-to-one). A separated spelling can: `Bob` kept apart from
 * `B.O.B` shares the slug `bob` with the leftover `bob` artist when one exists, so the suffix stays.
 */
export function assignIds(keys: Iterable<string>): Map<string, string> {
  const used = new Set<string>();
  const idByKey = new Map<string, string>();
  for (const k of [...keys].sort(cmpStr)) {
    const base = unitSlug(k) || 'artist';
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    idByKey.set(k, id);
  }
  return idByKey;
}

export function buildArtists(rows: RawSong[], entries: MergeEntry[] = []): BuildResult {
  const credits = new Map<string, number>();
  const withCredits = new Map<string, number>();
  const truncated = new Map<string, number>();
  const unknown = new Map<string, number>();
  const edge = new Map<string, number>();
  const guards = new Map<string, { songs: number; reason: string }>();
  const parsed: { row: RawSong; names: string[] }[] = [];
  let songsWithFeatured = 0;
  let emptyCreditSongs = 0;
  const issues: MergeIssue[] = [];

  // pass 1: parse credits, count spellings per plain normalised key
  const plain = new Map<string, Map<string, number>>();
  for (const row of rows) {
    credits.set(row.a, (credits.get(row.a) ?? 0) + 1);
    const pc = parseCredit(row.a);
    if (pc.emptyCredit) emptyCreditSongs++;
    if (pc.kind === 'split') songsWithFeatured++;
    if (pc.kind === 'guard') {
      const g = guards.get(row.a);
      guards.set(row.a, { songs: (g?.songs ?? 0) + 1, reason: pc.guardReason ?? '' });
    }
    if (EDGE.test(row.a)) edge.set(row.a, (edge.get(row.a) ?? 0) + 1);
    if (/\bwith\b/i.test(row.a)) withCredits.set(row.a, (withCredits.get(row.a) ?? 0) + 1);
    if (looksTruncated(row.a)) truncated.set(row.a, (truncated.get(row.a) ?? 0) + 1);
    if (pc.kind !== 'split' && normalize(pc.names[0] ?? '') === normalize(UNKNOWN)) unknown.set(row.a, (unknown.get(row.a) ?? 0) + 1);
    for (const name of pc.names) {
      const key = normalize(name);
      let m = plain.get(key);
      if (!m) plain.set(key, (m = new Map()));
      m.set(name, (m.get(name) ?? 0) + 1);
    }
    parsed.push({ row, names: pc.names });
  }

  // client-controlled separation of spellings that share a key (data/artist-merges.json `keepSeparate`)
  const { units, applied: appliedSeparations } = resolveSeparations(entries, plain, issues);
  const unitOf = (name: string) => {
    const k = normalize(name);
    return units.get(k)?.get(spellingKey(name)) ?? k;
  };

  const spellings = new Map<string, Map<string, number>>(); // unit key -> spelling -> occurrences
  const titles = new Map<string, string[]>(); // spelling -> example titles
  const rawSpellings = new Set<string>();
  for (const { row, names } of parsed) {
    for (const name of names) {
      const key = unitOf(name);
      let m = spellings.get(key);
      if (!m) spellings.set(key, (m = new Map()));
      m.set(name, (m.get(name) ?? 0) + 1);
      rawSpellings.add(name);
      const t = titles.get(name) ?? [];
      if (t.length < 3 && !t.includes(row.t)) t.push(row.t);
      titles.set(name, t);
    }
  }
  const artistsBeforeMerge = spellings.size;

  // approved merges
  const keys = new Set(spellings.keys());
  const idToKey = new Map<string, string>();
  for (const [k, id] of assignIds(keys)) idToKey.set(id, k);
  const { target, display, applied } = resolveMerges(entries, idToKey, keys, unitOf, issues);

  // group spellings by final key
  const groups = new Map<string, Map<string, number>>();
  for (const [key, sp] of spellings) {
    const fk = target.get(key) ?? key;
    let g = groups.get(fk);
    if (!g) groups.set(fk, (g = new Map()));
    for (const [s, c] of sp) g.set(s, (g.get(s) ?? 0) + c);
  }
  for (const fk of display.keys()) if (!groups.has(fk)) groups.set(fk, new Map([[display.get(fk) as string, 0]]));

  const sortedKeys = [...groups.keys()].sort(cmpStr);
  const idByKey = assignIds(sortedKeys);

  // songs: each song counts once per artist even if a main and a featured name resolve to the same one
  const counts = new Map<string, number>();
  const songs: Song[] = parsed.map(({ row, names }) => {
    const ids: string[] = [];
    for (const name of names) {
      const k = unitOf(name);
      const fk = target.get(k) ?? k;
      const id = idByKey.get(fk) as string;
      if (!ids.includes(id)) {
        ids.push(id);
        counts.set(fk, (counts.get(fk) ?? 0) + 1);
      }
    }
    return { n: row.n, t: row.t, a: row.a, ar: ids };
  });

  const mergedGroups: MergedGroup[] = [];
  const artists: (Artist & { key: string })[] = sortedKeys.map((k) => {
    const sp = [...(groups.get(k) as Map<string, number>).entries()];
    sp.sort((x, y) => y[1] - x[1] || y[0].length - x[0].length || cmpStr(x[0], y[0]));
    const override = display.get(k);
    const name = override ?? (sp[0] as [string, number])[0];
    const aliases = sp.map(([s]) => s).filter((s) => s !== name);
    const count = counts.get(k) ?? 0;
    if (sp.length > 1 && !override) {
      const variants = sp.map(([spelling, songs]) => ({ spelling, songs, examples: titles.get(spelling) ?? [] }));
      mergedGroups.push({ name, aliases, count, variants });
    }
    return { id: idByKey.get(k) as string, name, aliases, count, key: k };
  });
  artists.sort((x, y) => y.count - x.count || cmpStr(x.key, y.key));
  mergedGroups.sort((x, y) => y.count - x.count || cmpStr(x.name, y.name));

  const cleanedOf = (c: string) => parseCredit(c).names[0] ?? c;
  return {
    dataset: { songs, artists: artists.map((a) => ({ id: a.id, name: a.name, aliases: a.aliases, count: a.count })) },
    diagnostics: {
      distinctCredits: credits.size,
      distinctSpellings: rawSpellings.size,
      artistsBeforeMerge,
      artistsAfterMerge: artists.length,
      mergedGroups,
      unknownCredits: tally(unknown),
      edgeCredits: tally(edge).map((c) => {
        const pc = parseCredit(c.credit);
        return { ...c, outcome: pc.kind === 'split' ? `split: ${pc.names.join(' | ')}` : `kept whole as ${pc.names[0]}` };
      }),
      appliedSeparations,
      songsWithFeatured,
      emptyCreditSongs,
      withCredits: tally(withCredits),
      truncatedCredits: tally(truncated).map((t) => ({ ...t, cleaned: cleanedOf(t.credit) })),
      splitGuards: [...guards.entries()]
        .map(([credit, g]) => ({ credit, songs: g.songs, reason: g.reason }))
        .sort((x, y) => y.songs - x.songs || cmpStr(x.credit, y.credit)),
      mergeIssues: issues,
      appliedMerges: applied,
    },
  };
}
