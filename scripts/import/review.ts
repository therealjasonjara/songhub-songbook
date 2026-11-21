import { normalize } from '../../src/lib/normalize.ts';
import type { Artist } from '../../src/lib/dataset.ts';
import { spellingKey, type BuildDiagnostics, type MergedGroup } from './artists.ts';

export interface NearMember {
  name: string;
  key: string;
  count: number;
  why?: string;
}
export interface NearGroup {
  members: NearMember[];
  total: number;
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Levenshtein distance, giving up (returns max+1) once it must exceed `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        (prev[j] as number) + 1,
        (cur[j - 1] as number) + 1,
        (prev[j - 1] as number) + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1),
      );
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length] as number;
}

/** `shorter` equals `longer` with exactly one extra word inserted in the middle (not first, not last, not `and`). */
function oneExtraMiddleWord(shorter: string[], longer: string[]): boolean {
  if (longer.length !== shorter.length + 1 || shorter.length < 2) return false;
  for (let k = 1; k < longer.length - 1; k++) {
    if (longer[k] === 'and') continue;
    const without = longer.filter((_, i) => i !== k);
    if (without.every((t, i) => t === shorter[i])) return true;
  }
  return false;
}

const stripThe = (k: string) => (k.startsWith('the ') && k.length > 4 ? k.slice(4) : k);

/**
 * Near-matches that the automatic merge did NOT merge (A-002). Each group is a head artist (the one with the
 * most songs) plus the artists directly near it, so a chain of look-alikes cannot snowball into one giant group.
 * Rules (on normalised names, leading "the" ignored for the typo rules): same letters apart from spacing;
 * differ only by a leading "the"; 1 character apart (6+ letters) or 2 apart (9+ letters) with the same first
 * word (single-word names: same first letter); a name cut mid-word that starts a longer one (8+ letters);
 * one extra word in the middle (8+ letters). Collaboration credits are not matched on purpose.
 */
export function findNearMatches(artists: Artist[]): NearGroup[] {
  const items = artists
    .map((a) => ({ name: a.name, key: normalize(a.name), count: a.count }))
    .filter((x) => x.key !== '')
    .sort((x, y) => y.count - x.count || cmpStr(x.key, y.key));
  const edges = new Map<number, Map<number, string>>();
  const link = (i: number, j: number, reason: string) => {
    for (const [p, q] of [[i, j], [j, i]] as const) {
      const m = edges.get(p) ?? new Map<number, string>();
      if (!m.has(q)) m.set(q, reason);
      edges.set(p, m);
    }
  };
  const stripped = items.map((it) => stripThe(it.key));

  const bySquashed = new Map<string, number>();
  items.forEach((it, i) => {
    const s = it.key.replace(/ /g, '');
    const j = bySquashed.get(s);
    if (j === undefined) bySquashed.set(s, i);
    else link(j, i, 'same letters, different spacing');
  });
  const byStripped = new Map<string, number>();
  items.forEach((it, i) => {
    const s = stripped[i] as string;
    const j = byStripped.get(s);
    if (j === undefined) byStripped.set(s, i);
    else if (items[j]?.key !== it.key) link(j, i, 'only differs by a leading "the"');
  });

  const buckets = new Map<string, number[]>();
  items.forEach((_, i) => {
    const k = stripped[i] as string;
    const first = k.split(' ')[0] as string;
    const b = k.includes(' ') ? `w:${first}` : `c:${k[0]}`;
    const list = buckets.get(b);
    if (list) list.push(i);
    else buckets.set(b, [i]);
  });
  for (const idxs of buckets.values()) {
    for (let x = 0; x < idxs.length; x++) {
      for (let y = x + 1; y < idxs.length; y++) {
        const i = idxs[x] as number;
        const j = idxs[y] as number;
        const a = stripped[i] as string;
        const b = stripped[j] as string;
        const [s, l] = a.length <= b.length ? [a, b] : [b, a];
        if (s === l) continue;
        if (s.length >= 8 && l.startsWith(s) && l[s.length] !== ' ') {
          link(i, j, 'one name looks cut short');
          continue;
        }
        if (s.length >= 8 && oneExtraMiddleWord(s.split(' '), l.split(' '))) {
          link(i, j, 'one extra word');
          continue;
        }
        const d = editDistance(s, l, 2);
        if ((d === 1 && s.length >= 6) || (d === 2 && s.length >= 9)) link(i, j, `${d} character${d > 1 ? 's' : ''} apart`);
      }
    }
  }

  const assigned = new Set<number>();
  const groups: NearGroup[] = [];
  items.forEach((head, i) => {
    if (assigned.has(i)) return;
    const near = [...(edges.get(i) ?? [])].filter(([j]) => !assigned.has(j)).sort((p, q) => p[0] - q[0]);
    if (near.length === 0) return;
    assigned.add(i);
    const members: NearMember[] = [{ ...head, why: 'main entry (most songs)' }];
    for (const [j, why] of near) {
      assigned.add(j);
      members.push({ ...(items[j] as NearMember), why });
    }
    groups.push({ members, total: members.reduce((s, m) => s + m.count, 0) });
  });
  return groups.sort((x, y) => y.total - x.total || cmpStr((x.members[0] as NearMember).key, (y.members[0] as NearMember).key));
}

const PSEUDO = /^(unknown|gospel|various|traditional|anonymous|folk|christmas|children|nursery|instrumental|karaoke|soundtrack|ost|hymn|hymns|worship|praise|none|n\/a)\b|\b(songs?|hymns?|carols?|music|medley)$/;
export function looksLikeCategory(name: string): boolean {
  return PSEUDO.test(normalize(name));
}

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export interface SizeInfo {
  songsRaw: number;
  songsGzip: number;
  artistsRaw: number;
  artistsGzip: number;
}

export const NEAR_CAP = 150;
const MEMBER_CAP = 10;

export function renderReview(
  artists: Artist[],
  diag: BuildDiagnostics,
  near: NearGroup[],
  sizes: SizeInfo,
): string {
  const L: string[] = [];
  const confirm = mergedNeedingConfirmation(diag.mergedGroups);
  const kb = (n: number) => `${n.toLocaleString('en-US')} B (${(n / 1024).toFixed(1)} KB)`;
  L.push('# Artist review', '');
  L.push('Generated by `npm run build:data`. Do not edit by hand; re-run it instead.', '');
  L.push(
    'Artists are merged automatically only when their names are identical after normalising case, accents, punctuation, quotes, underscores, spacing and `&`/`and`. Everything below is a **decision for the client**: nothing here has been merged or changed.',
    '',
  );
  L.push('## How to approve merges', '');
  L.push(
    'Put the approved merges in `data/artist-merges.json` and re-run `npm run build:data`. The file is a list; the default is an empty list `[]`. Each entry merges artists into one (`into` becomes the display name, the other spellings become aliases):',
    '',
    '```json',
    '[',
    '  { "names": ["April Boy_jc Regino"], "into": "April Boy Regino" },',
    '  { "ids": ["some-artist-id"], "names": ["Another Spelling"], "into": "Display Name" }',
    ']',
    '```',
    '',
    'To keep two spellings apart that the automatic merge would join (for example `B.O.B` and `Bob`), add `{ "keepSeparate": ["B.O.B", "Bob"] }` (names or ids, at least two spellings of the same artist). They become separate artists with their own ids. Section (f) lists the candidates with the exact JSON.',
    '',
    '`names` match any spelling (compared after normalising); `ids` are the artist ids in `public/data/artists.json`. Unknown names or ids are listed under "Merge file problems" instead of failing.',
    '',
  );

  L.push('## Summary', '');
  L.push(`- Distinct printed credits: **${diag.distinctCredits}**`);
  L.push(`- Distinct artist spellings after splitting featured artists: ${diag.distinctSpellings}`);
  L.push(`- Artists after merging identical-when-normalised spellings: ${diag.artistsBeforeMerge}`);
  L.push(`- Artists after approved merges (\`data/artist-merges.json\`, ${diag.appliedMerges} rule(s) applied): **${diag.artistsAfterMerge}**`);
  L.push(`- Automatically merged groups: ${diag.mergedGroups.length}`);
  L.push(`- Songs with featured artists (split on ft / feat / featuring): ${diag.songsWithFeatured}`);
  L.push(`- Songs with an empty printed artist, listed under "Unknown": ${diag.emptyCreditSongs}`);
  L.push(`- Merged by rule, please confirm (section f): **${confirm.length}** group(s)`);
  L.push(`- \`keepSeparate\` groups applied: ${diag.appliedSeparations}`);
  L.push(`- Near-match groups not merged: **${near.length}** (the ${Math.min(NEAR_CAP, near.length)} biggest are listed)`);
  L.push(
    `- Dataset size (Node zlib, level 9, as the build measures it): songs ${kb(sizes.songsRaw)} raw, ${kb(sizes.songsGzip)} gzipped; artists ${kb(sizes.artistsRaw)} raw, ${kb(sizes.artistsGzip)} gzipped; **total ${kb(sizes.songsGzip + sizes.artistsGzip)} gzipped** against the 1.5 MB budget`,
    '',
  );

  if (diag.mergeIssues.length) {
    L.push('## Merge file problems', '');
    for (const i of diag.mergeIssues) L.push(`- rule ${i.rule}: ${i.message}`);
    L.push('');
  }

  L.push('## (a) Near-matches that were NOT merged', '');
  L.push(
    'Each group is the entry with the most songs plus the names close to it: 1-2 characters apart, a name cut short, one extra word in the middle, only spacing, or only a leading "the" different. Collaboration credits (`X, Y`, `X & Y`) are not matched on purpose. Biggest (most songs) first. Many will be genuinely different artists: only approve the ones that are the same act.',
    '',
  );
  near.slice(0, NEAR_CAP).forEach((g, i) => {
    L.push(`**${i + 1}.** ${g.total} songs`, '');
    L.push('| Name | Songs | Why it is listed |', '|---|---:|---|');
    for (const m of g.members.slice(0, MEMBER_CAP)) L.push(`| ${esc(m.name)} | ${m.count} | ${m.why ?? ''} |`);
    if (g.members.length > MEMBER_CAP) L.push(`| ... ${g.members.length - MEMBER_CAP} more | | |`);
    L.push('');
  });

  L.push('## (b) Category-like names (top 40 artists by song count)', '');
  L.push(
    'These stay as artists (a user can search "gospel" and open the list). Names marked **category** look like a genre or placeholder rather than a person; tell us if any should be hidden or dropped.',
    '',
    '| # | Name | Songs | |',
    '|--:|---|---:|---|',
  );
  artists.slice(0, 40).forEach((a, i) => {
    L.push(`| ${i + 1} | ${esc(a.name)} | ${a.count} | ${looksLikeCategory(a.name) ? '**category**' : ''} |`);
  });
  L.push('');
  const unknownTotal = diag.unknownCredits.reduce((s, c) => s + c.songs, 0);
  L.push(
    `**Unknown** (${unknownTotal} songs) is made of: ${diag.unknownCredits.map((c) => `${c.songs} printed ${c.credit === '' ? 'as an empty credit' : `\`${c.credit}\``}`).join(' + ')}.`,
    '',
  );
  const more = artists.filter((a, i) => i >= 40 && a.count >= 100 && looksLikeCategory(a.name));
  if (more.length) L.push(`Other category-like names with 100+ songs: ${more.map((a) => `${esc(a.name)} (${a.count})`).join(', ')}`, '');

  const WITH_CAP = 60;
  L.push('## (c) Credits using "with" (kept whole, not split)', '');
  L.push(
    `${diag.withCredits.length} distinct credits (${diag.withCredits.reduce((s, c) => s + c.songs, 0)} songs). Decision: not split, because "with" is also part of names. Tell us which should become featured artists.`,
    '',
    '| Credit | Songs |',
    '|---|---:|',
  );
  for (const c of diag.withCredits.slice(0, WITH_CAP)) L.push(`| ${esc(c.credit)} | ${c.songs} |`);
  if (diag.withCredits.length > WITH_CAP) L.push(`| ... ${diag.withCredits.length - WITH_CAP} more | |`);
  L.push('');

  const TR_CAP = 60;
  L.push('## (d) Credits that look truncated', '');
  L.push(
    `${diag.truncatedCredits.length} distinct credits end in \`...\` or a dangling \`&\`/\`,\`/\`+\` (the PDF cuts credits at 39 characters). Treatment: the full printed credit stays in \`a\`; the artist name used for listing drops the trailing \`...\` and dangling separator, and is then merged only if it is identical to another name. The cut name is not guessed back to a longer one; if a cut name is a start of a longer artist it shows up in (a).`,
    '',
    '| Printed credit | Main artist used | Songs |',
    '|---|---|---:|',
  );
  for (const c of diag.truncatedCredits.slice(0, TR_CAP)) L.push(`| ${esc(c.credit)} | ${esc(c.cleaned)} | ${c.songs} |`);
  if (diag.truncatedCredits.length > TR_CAP) L.push(`| ... ${diag.truncatedCredits.length - TR_CAP} more | | |`);
  L.push('');

  L.push('## (e) Featured markers that were not split', '');
  L.push(
    `${diag.splitGuards.length} distinct credits contain ft / feat / featuring but were kept whole because the main or a featured part would be empty.`,
    '',
    '| Credit | Songs | Reason |',
    '|---|---:|---|',
  );
  for (const c of diag.splitGuards.slice(0, 60)) L.push(`| ${esc(c.credit)} | ${c.songs} | ${c.reason} |`);
  if (diag.splitGuards.length > 60) L.push(`| ... ${diag.splitGuards.length - 60} more | | |`);
  L.push('');
  L.push(
    'Edge cases. A marker glued to the previous word is split only as `ft.`/`feat.` (with the dot) after 4+ letters, followed by a space and a capital letter, so `Daft. Punk` and `Draft.Beat` stay whole. A marker opened in a bracket ends the featured name at the closing bracket (the text after it is dropped). A trailing marker left on a kept-whole credit is removed from the name. Credits in the data that hit these cases:',
    '',
    '| Credit | Songs | Outcome |',
    '|---|---:|---|',
  );
  for (const c of diag.edgeCredits) L.push(`| ${esc(c.credit)} | ${c.songs} | ${esc(c.outcome)} |`);
  L.push('');

  L.push('## (f) Merged by rule: please confirm', '');
  L.push(
    `${confirm.length} merged group(s) where a variant is a dotted initialism (\`B.O.B\`) or a name of 4 characters or fewer after normalising. These were merged only because the punctuation was dropped, so they may be different acts. To keep any apart, add its JSON line to \`data/artist-merges.json\` (the file is a list) and re-run \`npm run build:data\`. A group you have already separated appears again only with the variants that remain together.`,
    '',
  );
  confirm.forEach((g, i) => {
    L.push(`**${i + 1}.** ${esc(g.name)}: ${g.count} songs`, '');
    for (const v of g.variants) L.push(`- \`${v.spelling}\`: ${v.songs} song(s), e.g. ${v.examples.map((t) => `"${esc(t)}"`).join('; ')}`);
    const sep = separateNames(g);
    if (sep.length < 2) L.push('', 'Differs only by case or trailing dots: nothing to separate.', '');
    else L.push('', '```json', JSON.stringify({ keepSeparate: sep }), '```', '');
  });
  return L.join('\n');
}

const DOTTED = /^(?:\p{L}\.){2,}$|^(?:\p{L}\.)+\p{L}$/u;
/** Variant is a dotted initialism (`B.O.B`, `M.I.A.`) or has a normalised key of 4 characters or fewer. */
export function needsConfirmation(spelling: string): boolean {
  return normalize(spelling).length <= 4 || spelling.split(/\s+/).some((t) => DOTTED.test(t));
}

export function mergedNeedingConfirmation(groups: MergedGroup[]): MergedGroup[] {
  return groups.filter((g) => g.variants.some((v) => needsConfirmation(v.spelling)) && separateNames(g).length >= 2);
}

/** One spelling per variant (case, spacing and trailing dots ignored), in the order shown. */
function separateNames(g: MergedGroup): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of g.variants) {
    const k = spellingKey(v.spelling);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v.spelling);
    }
  }
  return out;
}
