import type { Page, Word } from './bbox.ts';

/** A parsed song row. Field names are the dataset shape (see PRD Data Model). */
export interface RawSong {
  n: number;
  t: string;
  a: string;
  page: number;
  col: 1 | 2;
}

export interface Reject {
  page: number;
  col: 1 | 2 | null;
  reason: string;
  /** Raw text of everything that belonged to the rejected band, so nothing is lost. */
  raw: string;
  /** How many number anchors (number-column words) this reject accounts for. */
  anchors: number;
}

export interface PageStats {
  page: number;
  /** Rows parsed per column (1 and 2). */
  left: number;
  right: number;
  /** Rows reassembled from more than one visual line. */
  reassembled: number;
  rejects: number;
  anchors: number;
  /** Words deliberately ignored, by category (never song text). */
  ignored: { header: number; footer: number; other: number };
}

export interface ReassemblyStats {
  /** Rows made of more than one visual line (the headline number). */
  rows: number;
  titleWrapped: number;
  artistWrapped: number;
  /** Rows whose number is not on the first line (vertically centred / own line). */
  numberOffFirstLine: number;
  /** Numbers with no text in their band at all (kept with empty title and artist). */
  numberWithoutText: number;
}

export interface ParseResult {
  songs: RawSong[];
  rejects: Reject[];
  pages: PageStats[];
  anchors: number;
  reassembly: ReassemblyStats;
}

/* ---- Geometry, measured on the real PDF (see DECISIONS A-005) -------------------------------
 * Every page has a header band with `NO.` `TITLE` `ARTIST` once per column. Cells are laid out
 * at fixed offsets from those headers:
 *   number words    x0 < NO.x0 + 24        (numbers are centred under `NO.`, right edge ~ NO.x0 + 18.7)
 *   title words     NO.x0 + 24 <= x0 < ARTIST.x0 - 31.5   (titles start at NO.x0 + 28.6)
 *   artist words    x0 >= ARTIST.x0 - 31.5 (artists start at ARTIST.x0 - 31.0, exactly)
 * The right column begins 8pt left of its `NO.` header.
 * Vertically: lines of one row are ~8.8pt apart, consecutive rows start >= 11.5pt apart.
 */
export const GEOMETRY = {
  numberZoneWidth: 24,
  artistLeftFromHeader: 31.5,
  rightColumnMargin: 8,
  /** Words whose y0 differ by less than this are on the same visual line (title/artist baselines differ by 0.3). */
  lineTolerance: 2,
  /** A gap larger than this between visual lines starts a new row band. */
  rowGap: 10.5,
  /** A number's top may sit this far outside its band's first/last line and still belong to it. */
  numberSlack: 2.5,
  /** Footer = words starting within this distance of the page bottom. */
  footerBand: 28,
} as const;

const HEADER_TEXT = new Set(['NO.', 'TITLE', 'ARTIST']);

interface ColumnGeometry {
  col: 1 | 2;
  xMin: number;
  xMax: number;
  numberMax: number;
  titleMax: number;
}

function findGeometry(words: Word[]): { columns: ColumnGeometry[]; bodyTop: number } | null {
  const nos = words.filter((w) => w.text === 'NO.' && w.y0 < 60).sort((a, b) => a.x0 - b.x0);
  const artists = words.filter((w) => w.text === 'ARTIST' && w.y0 < 60).sort((a, b) => a.x0 - b.x0);
  const no1 = nos[0];
  const no2 = nos[1];
  const ar1 = artists[0];
  const ar2 = artists[1];
  if (nos.length !== 2 || artists.length !== 2 || !no1 || !no2 || !ar1 || !ar2) return null;
  const headerY = no1.y0;
  const headerWords = words.filter((w) => HEADER_TEXT.has(w.text) && Math.abs(w.y0 - headerY) < 2);
  const bodyTop = Math.max(...headerWords.map((w) => w.y1));
  const split = no2.x0 - GEOMETRY.rightColumnMargin;
  const mk = (col: 1 | 2, no: Word, ar: Word, xMin: number, xMax: number): ColumnGeometry => ({
    col,
    xMin,
    xMax,
    numberMax: no.x0 + GEOMETRY.numberZoneWidth,
    titleMax: ar.x0 - GEOMETRY.artistLeftFromHeader,
  });
  return {
    columns: [mk(1, no1, ar1, -Infinity, split), mk(2, no2, ar2, split, Infinity)],
    bodyTop,
  };
}

interface Line {
  y0: number;
  title: Word[];
  artist: Word[];
}

function byX(a: Word, b: Word): number {
  return a.x0 - b.x0;
}

function joinWords(words: Word[]): string {
  return words
    .slice()
    .sort(byX)
    .map((w) => w.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Band {
  lines: Line[];
  numbers: Word[];
}

/** Parse the rows of one column. Exported for tests. */
function parseColumn(
  page: number,
  g: ColumnGeometry,
  words: Word[],
  out: { songs: RawSong[]; rejects: Reject[]; stats: PageStats; re: ReassemblyStats },
): void {
  const numberWords: Word[] = [];
  const textWords: Word[] = [];
  for (const w of words) {
    if (w.x0 < g.numberMax) numberWords.push(w);
    else textWords.push(w);
  }

  // Number-column words that are not plain integers are reported, never dropped.
  const numbers: Word[] = [];
  for (const w of numberWords) {
    if (/^\d+$/.test(w.text)) numbers.push(w);
    else {
      out.rejects.push({
        page,
        col: g.col,
        reason: 'non-numeric text in the number column',
        raw: w.text,
        anchors: 0,
      });
      out.stats.rejects++;
    }
  }
  out.stats.anchors += numbers.length;

  // Visual lines of title/artist text, then row bands by vertical gap.
  const sorted = textWords.slice().sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const lines: Line[] = [];
  for (const w of sorted) {
    const last = lines[lines.length - 1];
    let line = last;
    if (!line || w.y0 - line.y0 > GEOMETRY.lineTolerance) {
      line = { y0: w.y0, title: [], artist: [] };
      lines.push(line);
    }
    (w.x0 < g.titleMax ? line.title : line.artist).push(w);
  }
  const bands: Band[] = [];
  for (const line of lines) {
    const band = bands[bands.length - 1];
    const prev = band?.lines[band.lines.length - 1];
    if (band && prev && line.y0 - prev.y0 <= GEOMETRY.rowGap) band.lines.push(line);
    else bands.push({ lines: [line], numbers: [] });
  }

  // Attach each number to the band whose vertical extent contains it.
  const orphans: Word[] = [];
  for (const num of numbers) {
    const band = bands.find((b) => {
      const top = b.lines[0]!.y0;
      const bottom = b.lines[b.lines.length - 1]!.y0;
      return num.y0 >= top - GEOMETRY.numberSlack && num.y0 <= bottom + GEOMETRY.numberSlack;
    });
    if (band) band.numbers.push(num);
    else orphans.push(num);
  }

  type Entry = { y: number; song?: RawSong; reject?: Reject };
  const entries: Entry[] = [];

  for (const band of bands) {
    const titleLines = band.lines.map((l) => joinWords(l.title)).filter(Boolean);
    const artistLines = band.lines.map((l) => joinWords(l.artist)).filter(Boolean);
    const y = band.lines[0]!.y0;
    if (band.numbers.length === 1) {
      const num = band.numbers[0]!;
      const n = Number(num.text);
      const song: RawSong = { n, t: titleLines.join(' '), a: artistLines.join(' '), page, col: g.col };
      if (!Number.isSafeInteger(n) || n < 1 || n > 99999) {
        entries.push({
          y,
          reject: {
            page,
            col: g.col,
            reason: 'number outside 1..99999',
            raw: `[no] ${num.text} [title] ${titleLines.join(' / ')} [artist] ${artistLines.join(' / ')}`,
            anchors: 1,
          },
        });
        continue;
      }
      entries.push({ y, song });
      if (band.lines.length > 1) {
        out.re.rows++;
        out.stats.reassembled++;
      }
      if (band.lines.filter((l) => l.title.length).length > 1) out.re.titleWrapped++;
      if (band.lines.filter((l) => l.artist.length).length > 1) out.re.artistWrapped++;
      if (Math.abs(num.y0 - band.lines[0]!.y0) > GEOMETRY.lineTolerance) out.re.numberOffFirstLine++;
    } else {
      entries.push({
        y,
        reject: {
          page,
          col: g.col,
          reason:
            band.numbers.length === 0
              ? 'text with no number in its row band'
              : 'more than one number in one row band',
          raw: `[no] ${band.numbers.map((w) => w.text).join(', ')} [title] ${titleLines.join(' / ')} [artist] ${artistLines.join(' / ')}`,
          anchors: band.numbers.length,
        },
      });
    }
  }

  // A number with no text anywhere near it: kept with empty title and artist, flagged in the report.
  for (const num of orphans) {
    const n = Number(num.text);
    if (!Number.isSafeInteger(n) || n < 1 || n > 99999) {
      entries.push({
        y: num.y0,
        reject: { page, col: g.col, reason: 'number outside 1..99999', raw: `[no] ${num.text}`, anchors: 1 },
      });
    } else {
      entries.push({ y: num.y0, song: { n, t: '', a: '', page, col: g.col } });
      out.re.numberWithoutText++;
    }
  }

  entries.sort((a, b) => a.y - b.y);
  for (const e of entries) {
    if (e.song) {
      out.songs.push(e.song);
      if (g.col === 1) out.stats.left++;
      else out.stats.right++;
    }
    if (e.reject) {
      out.rejects.push(e.reject);
      out.stats.rejects++;
    }
  }
}

export function parsePage(
  p: Page,
  out: { songs: RawSong[]; rejects: Reject[]; reassembly: ReassemblyStats },
): PageStats {
  const stats: PageStats = {
    page: p.page,
    left: 0,
    right: 0,
    reassembled: 0,
    rejects: 0,
    anchors: 0,
    ignored: { header: 0, footer: 0, other: 0 },
  };
  const geo = findGeometry(p.words);
  if (!geo) {
    out.rejects.push({
      page: p.page,
      col: null,
      reason: 'column headers (NO. / ARTIST, twice) not found; whole page not parsed',
      raw: p.words.map((w) => w.text).join(' '),
      anchors: 0,
    });
    stats.rejects++;
    return stats;
  }
  const footerTop = p.height - GEOMETRY.footerBand;
  const body: Word[] = [];
  for (const w of p.words) {
    if (w.y0 >= footerTop) stats.ignored.footer++;
    else if (w.y0 < geo.bodyTop - 1) {
      if (HEADER_TEXT.has(w.text)) stats.ignored.header++;
      else stats.ignored.other++;
    } else body.push(w);
  }
  const local = { songs: out.songs, rejects: out.rejects, stats, re: out.reassembly };
  for (const g of geo.columns) {
    parseColumn(
      p.page,
      g,
      body.filter((w) => w.x0 >= g.xMin && w.x0 < g.xMax),
      local,
    );
  }
  return stats;
}

export function emptyReassembly(): ReassemblyStats {
  return { rows: 0, titleWrapped: 0, artistWrapped: 0, numberOffFirstLine: 0, numberWithoutText: 0 };
}

export function parsePages(pages: Page[]): ParseResult {
  const songs: RawSong[] = [];
  const rejects: Reject[] = [];
  const reassembly = emptyReassembly();
  const stats: PageStats[] = [];
  for (const p of pages) stats.push(parsePage(p, { songs, rejects, reassembly }));
  const anchors = stats.reduce((s, p) => s + p.anchors, 0);
  // Stable sort: ties (duplicate numbers) keep document order (page, column, top to bottom).
  songs.sort((x, y) => x.n - y.n);
  return { songs, rejects, pages: stats, anchors, reassembly };
}
