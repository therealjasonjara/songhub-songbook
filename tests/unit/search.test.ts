import { describe, expect, it } from 'vitest';
import type { Artist, Dataset, Song } from '../../src/lib/dataset.ts';
import { normalize } from '../../src/lib/normalize.ts';
import { buildIndex, fuzzyEdits, loadIndex, searchSongs, serializeIndex, songsByArtist, suggestArtists, withinOneEdit } from '../../src/lib/search/index.ts';

interface Row {
  n: number;
  t: string;
  a: string;
  ar?: string[];
}
function dataset(rows: Row[], artists: Artist[] = []): Dataset {
  const byId = new Map(artists.map((a) => [a.id, a]));
  const songs: Song[] = rows.map((r) => {
    const ar = r.ar ?? [slug(r.a)];
    for (const id of ar) if (!byId.has(id)) byId.set(id, { id, name: r.a || 'Unknown', aliases: [], count: 0 });
    return { n: r.n, t: r.t, a: r.a, ar };
  });
  for (const s of songs) for (const id of s.ar) (byId.get(id) as Artist).count++;
  return { songs, artists: [...byId.values()].sort((x, y) => y.count - x.count || (x.id < y.id ? -1 : 1)) };
}
const slug = (s: string) => normalize(s).replace(/ /g, '-');
const titles = (ds: Dataset, q: string) => searchSongs(buildIndex(ds), q).results.map((h) => h.title);

const MAIN: Row[] = [
  { n: 1, t: 'Hotel California', a: 'Eagles' },
  { n: 2, t: "'Di Ka Na Others", a: "April 'Boy' Regino" },
  { n: 3, t: "(I've Had) the Time of My Life", a: 'Bill Medley' },
  { n: 4, t: 'Love', a: 'John Lennon' },
  { n: 5, t: 'Love Me Tender', a: 'Elvis Presley' },
  { n: 6, t: 'Endless Love', a: 'Lionel Richie' },
  { n: 7, t: 'Lovely Day', a: 'Bill Withers' },
  { n: 8, t: 'Tender Love', a: 'Force MDs' },
  { n: 9, t: 'Yesterday', a: 'Beatles' },
  { n: 10, t: 'The Girl From Yesterday', a: 'Eagles' },
  { n: 11, t: 'Desperado', a: 'Eagles' },
  { n: 12, t: 'Take It Easy', a: 'Eagles' },
  { n: 13, t: 'Sweet Caroline', a: 'Neil Diamond' },
  { n: 14, t: 'Ben&Ben Medley', a: 'Various' },
  { n: 15, t: 'Ang Pinakamagandang Babae', a: 'Ben&Ben' },
  { n: 16, t: 'Café del Mar', a: 'Energy 52' },
  { n: 17, t: 'R.E.M. Tribute', a: 'Various' },
  { n: 18, t: 'My_Way_Home', a: 'Gunhill Road' },
];
const ds = dataset(MAIN);
const index = buildIndex(ds);

describe('normalisation interplay', () => {
  it('ignores apostrophes, brackets and punctuation in titles and queries', () => {
    expect(titles(ds, 'di ka na others')[0]).toBe("'Di Ka Na Others");
    expect(titles(ds, "'DI KA, NA! Others")[0]).toBe("'Di Ka Na Others");
    expect(titles(ds, 'ive had the time')[0]).toBe("(I've Had) the Time of My Life");
    expect(titles(ds, "(I've had) the time")[0]).toBe("(I've Had) the Time of My Life");
  });
  it('treats & and "and" alike, strips diacritics and underscores', () => {
    expect(titles(ds, 'ben and ben medley')[0]).toBe('Ben&Ben Medley');
    expect(titles(ds, 'ben&ben medley')[0]).toBe('Ben&Ben Medley');
    expect(titles(ds, 'cafe del mar')[0]).toBe('Café del Mar');
    expect(titles(ds, 'my way home')[0]).toBe('My_Way_Home');
  });
  it('matches terms anywhere in the title', () => {
    expect(titles(ds, 'california')).toEqual(['Hotel California']);
    expect(titles(ds, 'time of my life')).toEqual(["(I've Had) the Time of My Life"]);
  });
});

describe('typo tolerance', () => {
  it('finds Hotel California from "hotel californa"', () => {
    expect(titles(ds, 'hotel californa')[0]).toBe('Hotel California');
  });
  it('picks the fuzzy edit budget by word length', () => {
    expect([3, 4, 5, 6, 12].map(fuzzyEdits)).toEqual([0, 1, 1, 2, 2]);
  });
  it('does not guess on very short words', () => {
    expect(titles(ds, 'lva')).toEqual([]);
  });
  it('a swapped letter pair in a long word still finds the song', () => {
    expect(titles(ds, 'califronia')[0]).toBe('Hotel California');
  });
});

describe('ranking order', () => {
  it('exact title > title starts with > phrase inside the title > ... for "love"', () => {
    expect(titles(ds, 'love')).toEqual([
      'Love', // exact
      'Love Me Tender', // starts with, whole word
      'Lovely Day', // starts with, last word partial
      'Tender Love', // word inside the title; shorter title first
      'Endless Love',
    ]);
  });
  it('whole-word starts before a longer word that only shares the start', () => {
    const ranks = titles(ds, 'love');
    expect(ranks.indexOf('Love Me Tender')).toBeLessThan(ranks.indexOf('Lovely Day'));
  });
  it('exact and prefix matches rank above fuzzy ones', () => {
    const d = dataset([
      { n: 1, t: 'Sweet Carolina', a: 'X' },
      { n: 2, t: 'Sweet Caroline', a: 'Y' },
      { n: 3, t: 'Sweet Carolin Dream', a: 'Z' },
    ]);
    // "sweet caroline": exact first; "carolin" (1 edit) and "carolina" (1 edit) are typo matches, after it
    const r = titles(d, 'sweet caroline');
    expect(r[0]).toBe('Sweet Caroline');
    expect(r.slice(1).sort()).toEqual(['Sweet Carolin Dream', 'Sweet Carolina']);
  });
  it('real prefix matches come before typo matches', () => {
    const d = dataset([
      { n: 1, t: 'Yesterdae Once More', a: 'X' },
      { n: 2, t: 'Yesterday Once More', a: 'Y' },
    ]);
    expect(titles(d, 'yesterday once mor')).toEqual(['Yesterday Once More', 'Yesterdae Once More']);
  });
  it('among typo matches the closer spelling comes first', () => {
    const d = dataset([
      { n: 1, t: 'Yesterdays', a: 'A' },
      { n: 2, t: 'Yesterday', a: 'B' },
    ]);
    expect(titles(d, 'yesturday')).toEqual(['Yesterday', 'Yesterdays']);
  });
  it('a title match beats an artist-only match', () => {
    const d = dataset([
      { n: 1, t: 'Desperado', a: 'Eagles' },
      { n: 2, t: 'Eagles Wings', a: 'Hillsong' },
      { n: 3, t: 'Fly Like an Eagle', a: 'Steve Miller Band' },
    ]);
    const r = titles(d, 'eagles');
    expect(r[0]).toBe('Eagles Wings');
    expect(r).toContain('Desperado');
    expect(r.indexOf('Desperado')).toBeGreaterThan(r.indexOf('Eagles Wings'));
  });
  it('credit-only matches are found, and a real title match with the same word still comes first', () => {
    const r = titles(ds, 'eagles');
    // no title contains "eagles": these four are artist-only matches
    expect(r.slice(0, 4).sort()).toEqual(['Desperado', 'Hotel California', 'Take It Easy', 'The Girl From Yesterday']);
    const d = dataset([...MAIN, { n: 99, t: 'Eagles Fly', a: 'Nobody' }]);
    expect(titles(d, 'eagles')[0]).toBe('Eagles Fly');
  });
  it('shorter title then lower number break ties deterministically', () => {
    const d = dataset([
      { n: 5, t: 'Home Again', a: 'A' },
      { n: 3, t: 'Home Again', a: 'B' },
      { n: 9, t: 'Home Sweet', a: 'C' },
    ]);
    const r = searchSongs(buildIndex(d), 'home').results;
    expect(r.map((h) => h.n)).toEqual([3, 5, 9]);
  });
});

describe('AND semantics and as-you-type', () => {
  it('requires every typed word', () => {
    expect(titles(ds, 'endless tender')).toEqual([]);
    expect(titles(ds, 'tender love')).toEqual(['Tender Love', 'Love Me Tender']);
  });
  it('treats the last typed word as a prefix', () => {
    expect(titles(ds, 'sweet carol')).toEqual(['Sweet Caroline']);
    expect(titles(ds, 'hotel calif')).toEqual(['Hotel California']);
    expect(titles(ds, 'hotel c')).toEqual(['Hotel California']);
  });
  it('does not treat earlier words as prefixes', () => {
    expect(titles(ds, 'cali hotel')).toEqual([]);
  });
});

describe('artist credit field', () => {
  it('finds a song by title plus artist, in either order', () => {
    expect(titles(ds, 'hotel california eagles')[0]).toBe('Hotel California');
    expect(titles(ds, 'eagles hotel')[0]).toBe('Hotel California');
  });
  it('title words alone beat artist words alone', () => {
    const d = dataset([
      { n: 1, t: 'Something Else', a: 'Love Band' },
      { n: 2, t: 'Love Story', a: 'Other' },
    ]);
    expect(titles(d, 'love')).toEqual(['Love Story', 'Something Else']);
  });
});

describe('empty and short queries', () => {
  it('returns nothing for empty, blank and punctuation-only queries', () => {
    for (const q of ['', '   ', '!!!', "'", '()', '...', '- _ -']) {
      expect(searchSongs(index, q)).toEqual({ results: [], total: 0, hasMore: false });
    }
  });
  it('answers a one-character query with title-initial words first, shortest title first', () => {
    const r = searchSongs(index, 'l');
    expect(r.results.map((h) => h.title)).toEqual([
      'Love',
      'Lovely Day',
      'Love Me Tender',
      'Tender Love',
      'Endless Love',
      "(I've Had) the Time of My Life",
    ]);
    expect(r.total).toBe(6);
  });
  it('caps a one-character query at 50 and counts all of it', () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ n: i + 1, t: `Zed ${i}`, a: 'A' }));
    const r = searchSongs(buildIndex(dataset(rows)), 'z');
    expect(r.results).toHaveLength(50);
    expect(r.total).toBe(120);
    expect(r.hasMore).toBe(true);
  });
});

describe('total, hasMore and hits', () => {
  const many = dataset(Array.from({ length: 130 }, (_, i) => ({ n: i + 1, t: `Moonlight ${i}`, a: `Band ${i % 7}` })));
  const idx = buildIndex(many);
  it('returns 50, the full total and hasMore when more matched', () => {
    const r = searchSongs(idx, 'moonlight');
    expect(r.results).toHaveLength(50);
    expect(r.total).toBe(130);
    expect(r.hasMore).toBe(true);
  });
  it('hasMore is false at exactly 50 and below', () => {
    const fifty = buildIndex(dataset(Array.from({ length: 50 }, (_, i) => ({ n: i + 1, t: `Moonlight ${i}`, a: 'A' }))));
    const r = searchSongs(fifty, 'moonlight');
    expect(r).toMatchObject({ total: 50, hasMore: false });
    expect(r.results).toHaveLength(50);
  });
  it('a hit carries number, title, printed credit and artist display names', () => {
    const d = dataset([{ n: 7, t: 'Blank Space', a: 'Taylor Swift ft. Someone', ar: ['taylor-swift', 'someone'] }], [
      { id: 'taylor-swift', name: 'Taylor Swift', aliases: [], count: 0 },
      { id: 'someone', name: 'Someone', aliases: [], count: 0 },
    ]);
    const [hit] = searchSongs(buildIndex(d), 'blank space').results;
    expect(hit).toEqual({
      n: 7,
      title: 'Blank Space',
      credit: 'Taylor Swift ft. Someone',
      artists: [
        { id: 'taylor-swift', name: 'Taylor Swift' },
        { id: 'someone', name: 'Someone' },
      ],
    });
  });
});

describe('suggestArtists', () => {
  const artists: Artist[] = [
    { id: 'eagles', name: 'Eagles', aliases: [], count: 0 },
    { id: 'eagles-of-death-metal', name: 'Eagles of Death Metal', aliases: [], count: 0 },
    { id: 'death-cab-for-cutie', name: 'Death Cab for Cutie', aliases: [], count: 0 },
    { id: 'ben-and-ben', name: 'Ben&Ben', aliases: ['Ben And Ben', 'Ben & Ben'], count: 0 },
    { id: 'taylor-swift', name: 'Taylor Swift', aliases: [], count: 0 },
    { id: 'tailor-swift-tribute', name: 'Tailor Swift Tribute', aliases: [], count: 0 },
    { id: 'april-boy-regino', name: "April Boy Regino", aliases: ["April 'Boy' Regino", 'April Boy_jc Regino'], count: 0 },
  ];
  const rows: Row[] = [];
  let n = 1;
  const add = (id: string, name: string, count: number) => {
    for (let i = 0; i < count; i++) rows.push({ n: n++, t: `${name} Song ${i}`, a: name, ar: [id] });
  };
  add('eagles', 'Eagles', 5);
  add('eagles-of-death-metal', 'Eagles of Death Metal', 3);
  add('death-cab-for-cutie', 'Death Cab for Cutie', 2);
  add('ben-and-ben', 'Ben&Ben', 4);
  add('taylor-swift', 'Taylor Swift', 6);
  add('april-boy-regino', 'April Boy Regino', 1);
  const aIdx = buildIndex(dataset(rows, artists));

  it('suggests artists whose name starts with the query, most songs first, with id and count', () => {
    expect(suggestArtists(aIdx, 'eag')).toEqual([
      { id: 'eagles', name: 'Eagles', count: 5 },
      { id: 'eagles-of-death-metal', name: 'Eagles of Death Metal', count: 3 },
    ]);
  });
  it('never suggests for a word that only appears mid-name', () => {
    for (const q of ['cab', 'cutie', 'of death', 'metal', 'swift', 'death metal', 'tribute']) expect(suggestArtists(aIdx, q)).toEqual([]);
  });
  it('suggests when the query is the start of a multi-word name', () => {
    expect(suggestArtists(aIdx, 'death cab')).toEqual([{ id: 'death-cab-for-cutie', name: 'Death Cab for Cutie', count: 2 }]);
  });
  it('needs at least 2 characters', () => {
    expect(suggestArtists(aIdx, 'e')).toEqual([]);
    expect(suggestArtists(aIdx, '')).toEqual([]);
    expect(suggestArtists(aIdx, '!!')).toEqual([]);
  });
  it('accepts one typo in the whole name for names of 5+ characters', () => {
    expect(suggestArtists(aIdx, 'eaglez').map((a) => a.name)).toEqual(['Eagles']);
    // a name that starts with the query ranks before a typo match, even with fewer songs
    expect(suggestArtists(aIdx, 'tailor swift').map((a) => a.name)).toEqual(['Tailor Swift Tribute', 'Taylor Swift']);
    expect(suggestArtists(aIdx, 'taylr swift')[0]?.name).toBe('Taylor Swift');
  });
  it('does not typo-match short names or two typos', () => {
    expect(suggestArtists(aIdx, 'eaglzz')).toEqual([]);
    expect(suggestArtists(aIdx, 'ben ben')).toEqual([]);
  });
  it('matches aliases but shows the canonical name, once', () => {
    expect(suggestArtists(aIdx, 'ben and')).toEqual([{ id: 'ben-and-ben', name: 'Ben&Ben', count: 4 }]);
    expect(suggestArtists(aIdx, 'april boy_jc')).toEqual([{ id: 'april-boy-regino', name: 'April Boy Regino', count: 1 }]);
    expect(suggestArtists(aIdx, 'april').filter((a) => a.id === 'april-boy-regino')).toHaveLength(1);
  });
  it('caps at 3 suggestions', () => {
    const many: Artist[] = Array.from({ length: 6 }, (_, i) => ({ id: `abba-${i}`, name: `Abba ${i}`, aliases: [], count: 0 }));
    const r = Array.from({ length: 6 }, (_, i) => ({ n: i + 1, t: 'x', a: `Abba ${i}`, ar: [`abba-${i}`] }));
    expect(suggestArtists(buildIndex(dataset(r, many)), 'abba')).toHaveLength(3);
  });
});

describe('songsByArtist', () => {
  it('lists every song A-Z by normalised title, then number, including featured credits', () => {
    const artists: Artist[] = [
      { id: 'a', name: 'A', aliases: [], count: 0 },
      { id: 'b', name: 'B', aliases: [], count: 0 },
    ];
    const d = dataset(
      [
        { n: 4, t: 'Zebra', a: 'A', ar: ['a'] },
        { n: 3, t: "'Alpha", a: 'A', ar: ['a'] },
        { n: 2, t: 'beta', a: 'B ft. A', ar: ['b', 'a'] },
        { n: 1, t: '(Alpha)', a: 'A', ar: ['a'] },
        { n: 9, t: 'Other', a: 'B', ar: ['b'] },
      ],
      artists,
    );
    const r = songsByArtist(buildIndex(d), 'a');
    expect(r.map((h) => h.n)).toEqual([1, 3, 2, 4]); // alpha(1), alpha(3), beta, zebra
    expect(songsByArtist(buildIndex(d), 'nobody')).toEqual([]);
  });
});

describe('determinism and serialisation', () => {
  it('gives identical results on repeated queries and on a rebuilt index', () => {
    const q = 'love';
    const a = searchSongs(index, q);
    expect(searchSongs(index, q)).toEqual(a);
    expect(searchSongs(buildIndex(ds), q)).toEqual(a);
  });
  it('a serialised index loads and answers the same', () => {
    const loaded = loadIndex(ds, serializeIndex(index));
    for (const q of ['love', 'hotel californa', 'eagles hotel']) expect(searchSongs(loaded, q)).toEqual(searchSongs(index, q));
  });
  it('withinOneEdit covers substitution, insertion and deletion', () => {
    expect(withinOneEdit('eagles', 'eaglez')).toBe(true);
    expect(withinOneEdit('eagles', 'eagle')).toBe(true);
    expect(withinOneEdit('eagle', 'eagles')).toBe(true);
    expect(withinOneEdit('eagles', 'eaglzz')).toBe(false);
    expect(withinOneEdit('abc', 'bca')).toBe(false);
  });
});

describe('dotted words: Mr.Brightside (A-007)', () => {
  const dotted = dataset([
    { n: 1, t: 'Mr.Brightside', a: 'The Killers' },
    { n: 2, t: 'Mr. Brightside Remix', a: 'DJ X' },
    { n: 3, t: 'Dr.Dre Anthem', a: 'Someone' },
    { n: 4, t: 'Take Me To St.Louis', a: 'Folk' },
    { n: 5, t: 'Losing My Religion', a: 'R.E.M.' },
    { n: 6, t: 'Nobody Told Me', a: 'L.Q.' },
    { n: 7, t: 'Shape of Water', a: 'B.O.B' },
    { n: 8, t: 'Brightside Dreams', a: 'Other' },
    { n: 9, t: 'Mr Nice Guy', a: 'Other' },
  ]);
  const index = buildIndex(dotted);
  const found = (q: string) => searchSongs(index, q).results.map((h) => h.n);

  it('finds it by its words, joined, as a prefix on the last word and with a typo', () => {
    for (const q of ['mr brightside', 'mr.brightside', 'mrbrightside', 'mr bright', 'mr brightsid', 'mr brigthside', 'brightside']) {
      expect(found(q), q).toContain(1);
    }
  });
  it('ranks the split title at the top tier, not as a fuzzy hit', () => {
    expect(found('mr brightside')[0]).toBe(1);
    expect(found('mr bright')[0]).toBe(1);
    expect(found('mr brightside')).toContain(2);
  });
  it('a word of the split title ranks as a word-prefix hit above a credit hit', () => {
    expect(found('dre')[0]).toBe(3);
    expect(found('louis')).toContain(4);
    expect(found('st louis')[0]).toBe(4);
    expect(found('st.louis')).toContain(4);
  });
  it('keeps initialisms joined: rem finds R.E.M., r e m is not needed', () => {
    expect(found('rem')).toContain(5);
    expect(found('r.e.m.')).toContain(5);
    expect(found('lq')).toContain(6);
    expect(found('bob')).toContain(7);
    expect(found('r e m')).not.toContain(5);
    expect(found('b o b')).not.toContain(7);
  });
  it('does not turn an ordinary title into something else', () => {
    expect(found('mr nice')).toEqual([9]);
  });
  it('a serialised index answers the same', () => {
    const loaded = loadIndex(dotted, serializeIndex(index));
    for (const q of ['mr brightside', 'mr.brightside', 'st louis']) expect(searchSongs(loaded, q)).toEqual(searchSongs(index, q));
  });
});

describe('fuzzy only runs below five exact matches (A-007)', () => {
  const ds = dataset([
    ...MAIN,
    { n: 90, t: 'Live Forever', a: 'Oasis' },
    { n: 91, t: 'Lonely Boy', a: 'Black Keys' },
  ]);

  it('with five or more exact matches a one-typo neighbour is not added', () => {
    const r = searchSongs(buildIndex(ds), 'love');
    expect(r.total).toBeGreaterThanOrEqual(5);
    expect(r.results.map((h) => h.n)).not.toContain(90);
    expect(r.total).toBe(r.results.length);
  });

  it('with fewer than five exact matches the fuzzy rows are added, after the exact ones', () => {
    const r = searchSongs(buildIndex(ds), 'lovely');
    const order = r.results.map((h) => h.n);
    expect(order[0]).toBe(7);
    expect(order).toContain(91);
    expect(order.indexOf(91)).toBeGreaterThan(order.indexOf(7));
  });
});
