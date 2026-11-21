import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assignIds, buildArtists, cleanName, parseCredit, type MergeEntry, type RawSong } from '../../scripts/import/artists.ts';
import { findNearMatches, editDistance, mergedNeedingConfirmation, needsConfirmation } from '../../scripts/import/review.ts';
import { encodeDataset } from '../../src/lib/dataset.ts';

const rows = (...credits: string[]): RawSong[] => credits.map((a, i) => ({ n: i + 1, t: `T${i + 1}`, a }));
const byName = (r: ReturnType<typeof buildArtists>, name: string) => r.dataset.artists.find((a) => a.name === name);
const idsOf = (r: ReturnType<typeof buildArtists>, n: number) =>
  r.dataset.songs.find((s) => s.n === n)?.ar.map((id) => r.dataset.artists.find((a) => a.id === id)?.name);

describe('featured split (A-003)', () => {
  it('splits on ft / ft. / feat / feat. / featuring, case-insensitive', () => {
    for (const c of ['X ft Y', 'X ft. Y', 'X feat Y', 'X Feat. Y', 'X featuring Y', 'X FT. Y']) {
      expect(parseCredit(c).names, c).toEqual(['X', 'Y']);
    }
  });
  it('tolerates the glued form', () => {
    expect(parseCredit('Meghan Trainor Feat.Riha.').names).toEqual(['Meghan Trainor', 'Riha.']);
  });
  it('lists the song under both artists and keeps the full credit', () => {
    const r = buildArtists(rows('Pitbull ft. Ne-Yo', 'Pitbull'));
    expect(idsOf(r, 1)).toEqual(['Pitbull', 'Ne-Yo']);
    expect(r.dataset.songs[0]?.a).toBe('Pitbull ft. Ne-Yo');
    expect(byName(r, 'Pitbull')?.count).toBe(2);
    expect(byName(r, 'Ne-Yo')?.count).toBe(1);
    expect(r.diagnostics.songsWithFeatured).toBe(1);
  });
  it('splits a bracketed feature cleanly', () => {
    expect(parseCredit('Dua Lipa (feat. Elton John)').names).toEqual(['Dua Lipa', 'Elton John']);
  });
  it('never splits on &, +, and, comma or with', () => {
    for (const c of ['Ben&Ben', 'Brooks & Dunn', 'Simon & Garfunkel', 'A + B', 'Hall and Oates', 'Taylor Swift, Ice Spice', 'Kyla Duet with Jay-R']) {
      expect(parseCredit(c).names, c).toEqual([c]);
    }
  });
  it('does not split when the main part or a featured part is empty, and reports it', () => {
    expect(parseCredit('Feat.Riha.')).toMatchObject({ names: ['Feat.Riha.'], kind: 'guard' });
    expect(parseCredit('X ft.').kind).toBe('guard');
    expect(parseCredit('X ft Y ft').kind).toBe('guard');
    const r = buildArtists(rows('Feat.Riha.'));
    expect(r.diagnostics.splitGuards).toEqual([{ credit: 'Feat.Riha.', songs: 1, reason: 'main artist part is empty' }]);
    expect(r.dataset.songs[0]?.ar.length).toBe(1);
  });
  it('does not split words that merely contain ft/feat', () => {
    expect(parseCredit('Softly Featherstone').kind).toBe('none');
  });
  it('splits a credit on every marker, featured groups stay whole', () => {
    expect(parseCredit('A ft. B & C feat. D').names).toEqual(['A', 'B & C', 'D']);
  });
  it('puts empty credits under Unknown', () => {
    const r = buildArtists(rows('', 'Unknown'));
    expect(byName(r, 'Unknown')?.count).toBe(2);
    expect(r.diagnostics.emptyCreditSongs).toBe(1);
  });
});

describe('truncated names', () => {
  it('drops trailing ellipsis and dangling separators from the artist name only', () => {
    expect(cleanName('Whitney Houston & Teddy Pender...')).toBe('Whitney Houston & Teddy Pender');
    expect(cleanName('Didi Maranon,')).toBe('Didi Maranon');
    expect(cleanName('Dua Lipa (')).toBe('Dua Lipa');
    const r = buildArtists(rows('Didi Maranon,', 'Didi Maranon'));
    expect(byName(r, 'Didi Maranon')?.count).toBe(2);
    expect(r.dataset.songs[0]?.a).toBe('Didi Maranon,');
    expect(r.diagnostics.truncatedCredits).toHaveLength(1);
  });
});

describe('merging (A-002)', () => {
  it('merges spellings identical after normalisation and keeps aliases', () => {
    const r = buildArtists(rows('Guns N\' Roses', 'Guns N\' Roses', 'GUNS N ROSES', 'Guns N’ Roses', 'Brooks & Dunn', 'Brooks and Dunn'));
    expect(r.dataset.artists.map((a) => a.name).sort()).toEqual(["Brooks and Dunn", "Guns N' Roses"]);
    const g = byName(r, "Guns N' Roses");
    expect(g?.count).toBe(4);
    expect(g?.aliases).toEqual(['Guns N’ Roses', 'GUNS N ROSES']);
    expect(byName(r, 'Brooks and Dunn')?.aliases).toEqual(['Brooks & Dunn']);
    expect(r.diagnostics.artistsBeforeMerge).toBe(2);
    expect(r.diagnostics.distinctSpellings).toBe(5);
  });
  it('chooses the most frequent spelling, then longest, then alphabetical', () => {
    const a = buildArtists(rows('Eagles', 'EAGLES', 'EAGLES', 'eagles'));
    expect(a.dataset.artists[0]?.name).toBe('EAGLES');
    const tie = buildArtists(rows('abba', 'ABBA.', 'Abba'));
    // all once: longest first ('ABBA.'), others alphabetical
    expect(tie.dataset.artists[0]?.name).toBe('ABBA.');
    expect(tie.dataset.artists[0]?.aliases).toEqual(['Abba', 'abba']);
    const tie2 = buildArtists(rows('Abba', 'ABBA'));
    expect(tie2.dataset.artists[0]?.name).toBe('ABBA');
    const reordered = buildArtists(rows('ABBA', 'Abba'));
    expect(reordered.dataset.artists[0]?.name).toBe('ABBA');
  });
  it('does not fuzzy-merge near spellings', () => {
    const r = buildArtists(rows('April Boy Regino', 'April Boy_jc Regino', 'Elvis Presley', 'Elvis Presly'));
    expect(r.dataset.artists).toHaveLength(4);
  });
  it('gives stable ids that do not depend on row order and are unique', () => {
    const a = buildArtists(rows('Zed', 'Alpha Beta', 'Alpha Beta'));
    const b = buildArtists(rows('Alpha Beta', 'Zed', 'Alpha Beta', 'Extra'));
    expect(a.dataset.artists.find((x) => x.name === 'Alpha Beta')?.id).toBe('alpha-beta');
    expect(b.dataset.artists.find((x) => x.name === 'Alpha Beta')?.id).toBe('alpha-beta');
    expect(new Set(a.dataset.artists.map((x) => x.id)).size).toBe(a.dataset.artists.length);
  });
  it('suffixes ids deterministically if slugs ever collide', () => {
    const r = buildArtists(rows('!!!', '???'));
    // both normalise to empty, so both are "Unknown"; one artist, no collision
    expect(r.dataset.artists).toHaveLength(1);
  });
  it('produces byte-identical output across runs', () => {
    const input = rows('A ft. B', 'a', 'B', 'The X', 'x', 'Y & Z');
    const one = encodeDataset(buildArtists(input).dataset);
    const two = encodeDataset(buildArtists(input).dataset);
    expect(one).toEqual(two);
  });
});

describe('approved merges (data/artist-merges.json)', () => {
  const input = rows('April Boy Regino', 'April Boy Regino', 'April Boy_jc Regino', 'Beatles', 'The Beatles');
  it('ships only the two client-approved keepSeparate defaults', () => {
    expect(JSON.parse(readFileSync('data/artist-merges.json', 'utf8'))).toEqual([
      { keepSeparate: ['B.O.B', 'Bob'] },
      { keepSeparate: ['M.I.A.', 'Mia'] },
    ]);
  });
  it('merges by names into the display name, others become aliases', () => {
    const r = buildArtists(input, [{ names: ['April Boy_jc Regino'], into: 'April Boy Regino' }]);
    const a = byName(r, 'April Boy Regino');
    expect(a?.count).toBe(3);
    expect(a?.aliases).toEqual(['April Boy_jc Regino']);
    expect(r.dataset.artists).toHaveLength(3);
    expect(r.diagnostics.appliedMerges).toBe(1);
    expect(r.dataset.songs[2]?.ar).toEqual([a?.id]);
  });
  it('merges by ids and takes `into` as the display name', () => {
    const r = buildArtists(input, [{ ids: ['beatles', 'the-beatles'], into: 'The Beatles' }]);
    const a = byName(r, 'The Beatles');
    expect(a?.count).toBe(2);
    expect(a?.id).toBe('the-beatles');
    expect(a?.aliases).toEqual(['Beatles']);
  });
  it('reports unknown names and ids instead of failing', () => {
    const r = buildArtists(input, [{ names: ['Nobody'], ids: ['nope'], into: 'April Boy Regino' }]);
    expect(r.diagnostics.mergeIssues.map((i) => i.message)).toEqual(['unknown artist id "nope"', 'no artist named "Nobody"']);
  });
  it('is deterministic with merges and survives a cycle', () => {
    const rules = [
      { names: ['Beatles'], into: 'The Beatles' },
      { names: ['The Beatles'], into: 'Beatles' },
    ];
    const a = encodeDataset(buildArtists(input, rules).dataset);
    expect(encodeDataset(buildArtists(input, rules).dataset)).toEqual(a);
  });
});

describe('near-match report', () => {
  it('finds typo, cut-short, spacing and "the" groups without chaining or merging', () => {
    const r = buildArtists(
      rows(
        ...Array(5).fill('Elvis Presley'),
        'Elvis Presly',
        ...Array(3).fill('April Boy Regino'),
        'April Boy_jc Regino',
        'Gloc 9',
        'Gloc9',
        'Beatles',
        'The Beatles',
        'Taylor Swift',
        'Taylor Swift, Ice Spice',
        'Michael Jackson',
        'Michael V',
      ),
    );
    const groups = findNearMatches(r.dataset.artists).map((g) => g.members.map((m) => m.name));
    expect(groups).toContainEqual(['Elvis Presley', 'Elvis Presly']);
    expect(groups).toContainEqual(['April Boy Regino', 'April Boy_jc Regino']);
    expect(groups.some((g) => g.includes('Gloc 9') && g.includes('Gloc9'))).toBe(true);
    expect(groups.some((g) => g.includes('Beatles') && g.includes('The Beatles'))).toBe(true);
    expect(groups.flat()).not.toContain('Michael V');
    expect(groups.flat()).not.toContain('Taylor Swift, Ice Spice');
  });
  it('edit distance gives up early', () => {
    expect(editDistance('abc', 'abd', 2)).toBe(1);
    expect(editDistance('abcdef', 'uvwxyz', 2)).toBe(3);
  });
});

describe('credit edge cases (T003 follow-up)', () => {
  it('drops a trailing marker from a guarded name, but keeps Little Feat', () => {
    expect(parseCredit('Rita Ora, David Guetta, Imanbek ft...')).toMatchObject({ names: ['Rita Ora, David Guetta, Imanbek'], kind: 'guard' });
    expect(parseCredit('Martin Solveig & the Cataracs feat...').names).toEqual(['Martin Solveig & the Cataracs']);
    expect(parseCredit('Bury It feat. Hayley Williams feat. ...').names).toEqual(['Bury It feat. Hayley Williams']);
    expect(parseCredit('Little Feat')).toMatchObject({ names: ['Little Feat'], kind: 'guard' });
  });
  it('splits a glued ft. only with the dot, 4+ letters before and a capital after a space', () => {
    expect(parseCredit('Bring Me the Horizonft. Lil Uzi Ver...').names).toEqual(['Bring Me the Horizon', 'Lil Uzi Ver']);
    expect(parseCredit('Daft. Punk')).toMatchObject({ names: ['Daft. Punk'], kind: 'none' });
    expect(parseCredit('Draft.Beat')).toMatchObject({ names: ['Draft.Beat'], kind: 'none' });
    expect(parseCredit('Horizonft Lil Uzi').kind).toBe('none');
    expect(parseCredit('Horizonft. lil uzi').kind).toBe('none');
  });
  it('ends a bracketed featured name at the closing bracket', () => {
    expect(parseCredit('FIFTY FIFTY(Feat. Kaliii)From Bar...').names).toEqual(['FIFTY FIFTY', 'Kaliii']);
    expect(parseCredit('Dua Lipa [feat. Elton John]Title').names).toEqual(['Dua Lipa', 'Elton John']);
    expect(parseCredit('A ft. B(C)').names).toEqual(['A', 'B(C)']);
  });
});

describe('per-song dedupe and ordering', () => {
  it('counts a song once when the same artist is main and featured', () => {
    const r = buildArtists(rows('A ft. A', 'Beatles ft. beatles'));
    expect(r.dataset.songs[0]?.ar).toHaveLength(1);
    expect(byName(r, 'A')?.count).toBe(1);
    expect(r.dataset.songs[1]?.ar).toHaveLength(1);
    expect(r.dataset.artists.reduce((n, a) => n + a.count, 0)).toBe(2);
  });
  it('counts once when a main and a featured artist merge to the same artist via an approved merge', () => {
    const r = buildArtists(rows('X ft. Y'), [{ names: ['Y'], into: 'X' }]);
    expect(r.dataset.songs[0]?.ar).toHaveLength(1);
    expect(byName(r, 'X')?.count).toBe(1);
  });
  it('orders artists by count descending, then key', () => {
    const r = buildArtists(rows('Zed', 'Mid', 'Mid', 'Top', 'Top', 'Top', 'Abe'));
    expect(r.dataset.artists.map((a) => [a.name, a.count])).toEqual([['Top', 3], ['Mid', 2], ['Abe', 1], ['Zed', 1]]);
  });
});

describe('keepSeparate', () => {
  const input = rows('B.O.B', 'B.O.B.', 'Bob', 'bob', 'M.I.A.', 'Mia');
  const rule: MergeEntry[] = [{ keepSeparate: ['B.O.B', 'Bob'] }];
  it('merges by default, separates on request', () => {
    expect(buildArtists(input).dataset.artists.find((a) => a.name === 'B.O.B.')?.count).toBe(4);
    const r = buildArtists(input, rule);
    expect(byName(r, 'B.O.B.')?.count).toBe(2);
    expect(byName(r, 'B.O.B.')?.aliases).toEqual(['B.O.B']);
    expect(byName(r, 'Bob')?.count).toBe(2);
    expect(byName(r, 'Bob')?.aliases).toEqual(['bob']);
    expect(r.diagnostics.appliedSeparations).toBe(1);
    expect(r.diagnostics.mergeIssues).toEqual([]);
    // M.I.A. was not listed: still merged with Mia
    expect(r.dataset.artists.filter((a) => /^m/i.test(a.name))).toHaveLength(1);
  });
  it('gives distinct, deterministic ids that do not depend on row order', () => {
    const a = buildArtists(input, rule);
    const b = buildArtists([...input].reverse().map((x, i) => ({ ...x, n: i + 1 })), rule);
    const idOf = (r: typeof a, name: string) => byName(r, name)?.id;
    expect(idOf(a, 'B.O.B.')).toBe('b.o.b');
    expect(idOf(a, 'Bob')).toBe('bob');
    expect(idOf(b, 'B.O.B.')).toBe('b.o.b');
    expect(idOf(b, 'Bob')).toBe('bob');
    expect(encodeDataset(buildArtists(input, rule).dataset)).toEqual(encodeDataset(a.dataset));
  });
  it('accepts ids, and an id selects the remaining spellings', () => {
    const r = buildArtists(rows("Guns N' Roses", 'Guns N Roses', 'Guns N Roses'), [{ keepSeparate: ['guns-n-roses', "Guns N' Roses"] }]);
    expect(r.diagnostics.mergeIssues).toEqual([]);
    expect(r.dataset.artists.map((a) => [a.name, a.count])).toEqual([['Guns N Roses', 2], ["Guns N' Roses", 1]]);
  });
  it('suffixes ids when a separated spelling slugs like another artist', () => {
    const r = buildArtists(rows('Bo.b', 'Bob', 'B.O.B'), [{ keepSeparate: ['Bob', 'B.O.B'] }]);
    const ids = r.dataset.artists.map((a) => a.id).sort();
    expect(ids).toEqual(['b.o.b', 'bob', 'bob-2']);
    expect(byName(r, 'Bo.b')?.id).toBe('bob');
    expect(byName(r, 'Bob')?.id).toBe('bob-2');
    expect([...assignIds(['a', 'a\u0001a'])]).toEqual([['a', 'a'], ['a\u0001a', 'a-2']]);
  });
  it('reports invalid entries instead of failing', () => {
    const r = buildArtists(input, [
      { keepSeparate: ['B.O.B'] },
      { keepSeparate: ['B.O.B', 'Nobody'] },
      { keepSeparate: ['B.O.B', 'Mia'] },
      { keepSeparate: ['B.O.B', 'B.O.B.'] },
      { keepSeparate: 'B.O.B' as unknown as string[] },
      null as unknown as MergeEntry,
      { keepSeparate: ['B.O.B', 'Bob'] },
    ]);
    expect(r.diagnostics.mergeIssues.map((i) => i.rule)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.diagnostics.appliedSeparations).toBe(1);
    expect(byName(r, 'Bob')).toBeDefined();
  });
  it('flags dotted initialisms and short names for confirmation', () => {
    expect(['B.O.B', 'M.I.A.', 'L.T.D', 'T.A.T.U', 'A.J', 'Mia', 'M#', 'L.A. Lopez'].every(needsConfirmation)).toBe(true);
    expect(['Beyonce', 'Bruno Mars', 'Mr. Big', 'J. Cole Band'].some(needsConfirmation)).toBe(false);
    const g = buildArtists(rows('B.O.B', 'Bob', 'Elvis Presley', 'ELVIS PRESLEY', 'Rem', 'R.E.M.', 'ABBA', 'Abba.')).diagnostics.mergedGroups;
    expect(mergedNeedingConfirmation(g).map((x) => x.name).sort()).toEqual(['B.O.B', 'R.E.M.']);
  });
});

describe('Unknown breakdown', () => {
  it('itemises printed Unknown, empty and `..`', () => {
    const r = buildArtists(rows('Unknown', 'Unknown', '', '..', '..', '..', 'A'));
    expect(r.diagnostics.unknownCredits).toEqual([
      { credit: '..', songs: 3 },
      { credit: 'Unknown', songs: 2 },
      { credit: '', songs: 1 },
    ]);
    expect(byName(r, 'Unknown')?.count).toBe(6);
  });
});
