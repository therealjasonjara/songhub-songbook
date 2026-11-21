import { describe, expect, it } from 'vitest';
import { decodeEntities, parseBbox, type Page, type Word } from '../../scripts/import/bbox.ts';
import { parsePages } from '../../scripts/import/parse.ts';
import { findDuplicates, renderReport, serializeSongs } from '../../scripts/import/report.ts';

/* Fixture geometry mirrors the real PDF: header NO. at 27.44 / 312.08, ARTIST at 226.97 / 511.61;
 * numbers x0 ~24, titles x0 56 / 341, artists x0 196 / 481. Row pitch 12, wrapped-line pitch 9. */
const H = 7.5;
function w(x0: number, y0: number, text: string): Word {
  return { x0, y0, x1: x0 + text.length * 5, y1: y0 + H, text };
}
const COL = {
  1: { no: 24, title: 56, artist: 196 },
  2: { no: 309, title: 341, artist: 481 },
} as const;

function headers(): Word[] {
  return [
    w(27.44, 28.8, 'NO.'),
    w(110, 28.8, 'TITLE'),
    w(226.97, 28.8, 'ARTIST'),
    w(312.08, 28.8, 'NO.'),
    w(394.8, 28.8, 'TITLE'),
    w(511.61, 28.8, 'ARTIST'),
  ];
}
function footer(): Word[] {
  return [w(18, 817.7, 'SONGHUB'), w(63.8, 817.7, 'SONG'), w(91.2, 817.7, 'LIST'), w(522.9, 817.7, 'Page'), w(545.6, 817.7, '1'), w(552.7, 817.7, 'of'), w(563.1, 817.7, '384')];
}
/** Words of a text run starting at x0, one word per space-separated token. */
function run(col: 1 | 2, field: 'title' | 'artist', y0: number, text: string): Word[] {
  let x = COL[col][field];
  return text.split(' ').map((tok) => {
    const word = w(x, y0, tok);
    x = word.x1 + 2.2;
    return word;
  });
}
const num = (col: 1 | 2, y0: number, text: string): Word => w(COL[col].no, y0, text);

function page(words: Word[], n = 1): Page {
  return { page: n, width: 595.2756, height: 841.8898, words: [...headers(), ...words, ...footer()] };
}
const parse = (...pages: Page[]) => parsePages(pages);

describe('import parser: single rows', () => {
  it('parses a normal row', () => {
    const r = parse(page([num(1, 43, '36527'), ...run(1, 'title', 43, '#9 Dream'), ...run(1, 'artist', 43, 'John Lennon')]));
    expect(r.songs).toEqual([{ n: 36527, t: '#9 Dream', a: 'John Lennon', page: 1, col: 1 }]);
    expect(r.rejects).toEqual([]);
    expect(r.reassembly.rows).toBe(0);
  });

  it('parses both columns of a page and keeps column and page', () => {
    const r = parse(
      page([
        num(1, 43, '100'), ...run(1, 'title', 43, 'Left Song'), ...run(1, 'artist', 43, 'Left Artist'),
        num(2, 43, '200'), ...run(2, 'title', 43, 'Right Song'), ...run(2, 'artist', 43, 'Right Artist'),
        num(1, 55, '101'), ...run(1, 'title', 55, 'Second Left'), ...run(1, 'artist', 55, 'A'),
      ], 5),
    );
    expect(r.songs.map((s) => [s.n, s.t, s.a, s.page, s.col])).toEqual([
      [100, 'Left Song', 'Left Artist', 5, 1],
      [101, 'Second Left', 'A', 5, 1],
      [200, 'Right Song', 'Right Artist', 5, 2],
    ]);
    expect(r.pages[0]).toMatchObject({ left: 2, right: 1 });
  });

  it.each([
    ["'Di Ka Na Others", "'Di Ka Na Others"],
    ["(I've Had) the Time of My Life", "(I've Had) the Time of My Life"],
    ['1-800-273-8255', '1-800-273-8255'],
    ['10,000 Hours', '10,000 Hours'],
    ['"Quoted" Title', '"Quoted" Title'],
  ])('keeps a title that starts with punctuation or a digit: %s', (title, expected) => {
    const r = parse(page([num(2, 43, '13241'), ...run(2, 'title', 43, title), ...run(2, 'artist', 43, 'Dan + Shay, Justin Bieber ft. X & Y')]));
    expect(r.songs).toHaveLength(1);
    expect(r.songs[0]).toMatchObject({ n: 13241, t: expected, a: 'Dan + Shay, Justin Bieber ft. X & Y' });
  });

  it('a title word that is purely numeric stays in the title, not the number column', () => {
    const r = parse(page([num(1, 43, '30093'), ...run(1, 'title', 43, '102'), ...run(1, 'artist', 43, 'The 1975')]));
    expect(r.songs).toEqual([{ n: 30093, t: '102', a: 'The 1975', page: 1, col: 1 }]);
  });
});

describe('import parser: wrapped rows', () => {
  it('reassembles a wrapped title (number vertically centred)', () => {
    const r = parse(
      page([
        num(2, 100, '12345'),
        ...run(2, 'title', 95.5, '110 Percent If You\'re Never Gonna'),
        ...run(2, 'title', 104.5, 'Move'),
        ...run(2, 'artist', 95.5, 'Jessie Ware'),
        num(2, 116, '12346'), ...run(2, 'title', 116, 'Next'), ...run(2, 'artist', 116, 'Someone'),
      ]),
    );
    expect(r.songs[0]).toEqual({ n: 12345, t: "110 Percent If You're Never Gonna Move", a: 'Jessie Ware', page: 1, col: 2 });
    expect(r.songs[1]).toMatchObject({ n: 12346, t: 'Next', a: 'Someone' });
    expect(r.rejects).toEqual([]);
    expect(r.reassembly).toMatchObject({ rows: 1, titleWrapped: 1, artistWrapped: 0, numberOffFirstLine: 1 });
  });

  it('reassembles a wrapped artist', () => {
    const r = parse(
      page([
        num(2, 100, '1369'),
        ...run(2, 'title', 95.5, '1-800-273-8255'),
        ...run(2, 'artist', 95.5, 'Logic ft. Alessia Cara &'),
        ...run(2, 'artist', 104.5, 'Khalid'),
      ]),
    );
    expect(r.songs).toEqual([{ n: 1369, t: '1-800-273-8255', a: 'Logic ft. Alessia Cara & Khalid', page: 1, col: 2 }]);
    expect(r.reassembly).toMatchObject({ rows: 1, artistWrapped: 1, titleWrapped: 0 });
  });

  it('reassembles when both title and artist wrap, with a three-line band', () => {
    const r = parse(
      page([
        num(1, 61, '777'),
        ...run(1, 'title', 52, 'Very Long Title'), ...run(1, 'title', 61, 'That Keeps Going'), ...run(1, 'title', 70, 'And Going'),
        ...run(1, 'artist', 52.3, 'First Artist &'), ...run(1, 'artist', 61.3, 'Second Artist'),
      ]),
    );
    expect(r.songs).toEqual([
      { n: 777, t: 'Very Long Title That Keeps Going And Going', a: 'First Artist & Second Artist', page: 1, col: 1 },
    ]);
  });

  it('attaches a number printed on the second line, or on a line of its own', () => {
    const r = parse(
      page([
        // number level with the second line only
        num(1, 52, '10'), ...run(1, 'title', 43, 'Top Part'), ...run(1, 'title', 52, 'Bottom Part'), ...run(1, 'artist', 43, 'Band'),
        // number whose band has text on one side only (artist-only line below the title)
        num(1, 82, '11'), ...run(1, 'title', 77, 'Solo'), ...run(1, 'artist', 86, 'Wrapped Artist'),
      ]),
    );
    expect(r.songs.map((s) => [s.n, s.t, s.a])).toEqual([
      [10, 'Top Part Bottom Part', 'Band'],
      [11, 'Solo', 'Wrapped Artist'],
    ]);
    expect(r.rejects).toEqual([]);
  });

  it('does not merge neighbouring rows 12pt apart', () => {
    const r = parse(
      page([
        num(1, 43, '1'), ...run(1, 'title', 43, 'A'), ...run(1, 'artist', 43, 'X'),
        num(1, 55, '2'), ...run(1, 'title', 55, 'B'), ...run(1, 'artist', 55, 'Y'),
        num(1, 67, '3'), ...run(1, 'title', 67, 'C'), ...run(1, 'artist', 67, 'Z'),
      ]),
    );
    expect(r.songs.map((s) => [s.n, s.t, s.a])).toEqual([[1, 'A', 'X'], [2, 'B', 'Y'], [3, 'C', 'Z']]);
    expect(r.reassembly.rows).toBe(0);
  });
});

describe('import parser: noise and rejects', () => {
  it('ignores header rows and the page footer, and counts them', () => {
    const r = parse(page([num(1, 43, '5'), ...run(1, 'title', 43, 'Only Song'), ...run(1, 'artist', 43, 'Someone')]));
    expect(r.songs).toHaveLength(1);
    expect(r.rejects).toEqual([]);
    expect(r.pages[0]?.ignored).toEqual({ header: 6, footer: 7, other: 0 });
  });

  it('ignores stray non-header words above the table body', () => {
    const stray = [w(300, 10, 'Confidential')];
    const r = parse(page([...stray, num(1, 43, '5'), ...run(1, 'title', 43, 'S'), ...run(1, 'artist', 43, 'A')]));
    expect(r.songs).toHaveLength(1);
    expect(r.pages[0]?.ignored.other).toBe(1);
  });

  it('rejects text that has no number, with the raw text', () => {
    const r = parse(page([...run(1, 'title', 43, 'Orphan Title'), ...run(1, 'artist', 43, 'Orphan Artist')]));
    expect(r.songs).toEqual([]);
    expect(r.rejects).toEqual([
      expect.objectContaining({ page: 1, col: 1, reason: 'text with no number in its row band', raw: '[no]  [title] Orphan Title [artist] Orphan Artist', anchors: 0 }),
    ]);
  });

  it('rejects a band holding two numbers and still counts both anchors', () => {
    const r = parse(page([num(1, 43, '1'), num(1, 52, '2'), ...run(1, 'title', 43, 'T'), ...run(1, 'title', 52, 'U')]));
    expect(r.songs).toEqual([]);
    expect(r.rejects).toHaveLength(1);
    expect(r.rejects[0]).toMatchObject({ reason: 'more than one number in one row band', anchors: 2 });
    expect(r.anchors).toBe(2);
  });

  it('rejects numbers outside 1..99999 and 0, reporting them', () => {
    const r = parse(
      page([
        num(1, 43, '123456'), ...run(1, 'title', 43, 'Too Big'), ...run(1, 'artist', 43, 'A'),
        num(1, 55, '0'), ...run(1, 'title', 55, 'Zero'), ...run(1, 'artist', 55, 'B'),
        num(1, 67, '99999'), ...run(1, 'title', 67, 'Max'), ...run(1, 'artist', 67, 'C'),
      ]),
    );
    expect(r.songs.map((s) => s.n)).toEqual([99999]);
    expect(r.rejects.map((x) => x.reason)).toEqual(['number outside 1..99999', 'number outside 1..99999']);
    expect(r.songs.length + r.rejects.reduce((s, x) => s + x.anchors, 0)).toBe(r.anchors);
  });

  it('rejects non-numeric text in the number column instead of dropping it', () => {
    const r = parse(page([num(1, 43, '12a'), num(1, 55, '7'), ...run(1, 'title', 55, 'Real'), ...run(1, 'artist', 55, 'Row')]));
    expect(r.songs.map((s) => s.n)).toEqual([7]);
    expect(r.rejects).toEqual([expect.objectContaining({ reason: 'non-numeric text in the number column', raw: '12a', anchors: 0 })]);
  });

  it('keeps a lone number with empty title and artist, and an empty artist', () => {
    const r = parse(page([num(1, 43, '9'), num(1, 55, '8'), ...run(1, 'title', 55, 'No Artist')]));
    expect(r.songs.map((s) => [s.n, s.t, s.a])).toEqual([[8, 'No Artist', ''], [9, '', '']]);
    expect(r.reassembly.numberWithoutText).toBe(1);
  });

  it('rejects a whole page, loudly, when the headers are missing', () => {
    const p: Page = { page: 3, width: 595, height: 842, words: [w(56, 43, 'x')] };
    const r = parse(p);
    expect(r.songs).toEqual([]);
    expect(r.rejects).toEqual([expect.objectContaining({ page: 3, col: null, raw: 'x' })]);
  });

  it('never overwrites duplicate numbers: both rows stay, sorted by number then document order', () => {
    const r = parse(
      page([num(1, 43, '50'), ...run(1, 'title', 43, 'First'), ...run(1, 'artist', 43, 'A')], 1),
      page([num(2, 43, '50'), ...run(2, 'title', 43, 'Second'), ...run(2, 'artist', 43, 'B'), num(1, 43, '49'), ...run(1, 'title', 43, 'Before'), ...run(1, 'artist', 43, 'C')], 2),
    );
    expect(r.songs.map((s) => [s.n, s.t, s.page, s.col])).toEqual([[49, 'Before', 2, 1], [50, 'First', 1, 1], [50, 'Second', 2, 2]]);
    expect(findDuplicates(r.songs)).toHaveLength(1);
  });
});

describe('import output', () => {
  const pages = [
    page([num(1, 43, '3'), ...run(1, 'title', 43, 'B'), ...run(1, 'artist', 43, 'X'), num(2, 43, '3'), ...run(2, 'title', 43, 'C'), ...run(2, 'artist', 43, 'Y'), num(1, 55, '1'), ...run(1, 'title', 55, 'A')]),
  ];
  const result = parsePages(pages);
  const input = { result, sourceName: 'x.pdf', sourceSha256: 'abc', pageCount: 1 };

  it('serialises one record per line with exactly n, t, a, page, col', () => {
    const text = serializeSongs(result.songs);
    expect(text.split('\n')[1]).toBe('{"n":1,"t":"A","a":"","page":1,"col":1},');
    expect(JSON.parse(text)).toHaveLength(3);
  });

  it('is deterministic', () => {
    expect(serializeSongs(parsePages(pages).songs)).toBe(serializeSongs(result.songs));
    expect(renderReport(input)).toBe(renderReport({ ...input, result: parsePages(pages) }));
  });

  it('report lists duplicates with both records, empty artists, and states the wrapped count', () => {
    const md = renderReport(input);
    expect(md).toContain('balanced, nothing dropped silently');
    expect(md).toContain('**1** numbers across 2 rows');
    expect(md).toContain('title "B", artist "X"');
    expect(md).toContain('title "C", artist "Y"');
    expect(md).toContain('empty artist');
    expect(md).toContain('0 rows were reassembled');
  });

  it('report lists every rejected row with its page, column, reason and raw text', () => {
    const rejecting = parsePages([
      page([...run(1, 'title', 43, 'Orphan Title'), ...run(1, 'artist', 43, 'Orphan Artist')], 7),
    ]);
    const md = renderReport({ ...input, result: rejecting, pageCount: 7 });
    expect(md).not.toContain('## Rejected rows\n\nNone.');
    expect(md).toContain('| 7 | 1 | text with no number in its row band |');
    expect(md).toContain('[title] Orphan Title [artist] Orphan Artist');
  });

  it('report says MISMATCH, and not balanced, when rows and anchors do not add up', () => {
    const unbalanced = { ...result, anchors: result.anchors + 1 };
    const md = renderReport({ ...input, result: unbalanced });
    expect(md).toContain('**MISMATCH**');
    expect(md).not.toContain('balanced, nothing dropped silently');
  });
});

describe('bbox parsing', () => {
  it('decodes entities and reads page size and words', () => {
    const xhtml =
      '<doc><page width="595.27" height="841.88"><word xMin="56.0" yMin="43.0" xMax="65.9" yMax="50.5">&apos;Di</word>' +
      '<word xMin="68.0" yMin="43.0" xMax="70" yMax="50.5">&amp;</word></page>' +
      '<page width="595.27" height="841.88"><word xMin="1" yMin="2" xMax="3" yMax="4">F&#39;ck&#x41;</word></page></doc>';
    const pages = parseBbox(xhtml);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({ page: 1, width: 595.27, height: 841.88 });
    expect(pages[0]?.words.map((x) => x.text)).toEqual(["'Di", '&']);
    expect(pages[1]?.words[0]?.text).toBe("F'ckA");
    expect(decodeEntities('&lt;a&gt; &unknown;')).toBe('<a> &unknown;');
  });
});
