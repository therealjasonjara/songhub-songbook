import { spawnSync } from 'node:child_process';

/** One word box from poppler's `pdftotext -bbox` output (PDF points, origin top-left). */
export interface Word {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  text: string;
}

export interface Page {
  /** 1-based page number */
  page: number;
  width: number;
  height: number;
  words: Word[];
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x')) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return ENTITIES[body] ?? whole;
  });
}

const PAGE_RE = /<page width="([\d.]+)" height="([\d.]+)">/;
const WORD_RE = /<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([\s\S]*?)<\/word>/g;

/** Parse the XHTML produced by `pdftotext -bbox` (word boxes only) into pages. */
export function parseBbox(xhtml: string): Page[] {
  const chunks = xhtml.split('<page ').slice(1);
  return chunks.map((chunk, i) => {
    const head = PAGE_RE.exec('<page ' + chunk);
    if (!head) throw new Error(`bbox output: page ${i + 1} has no width/height`);
    const words: Word[] = [];
    for (const m of chunk.matchAll(WORD_RE)) {
      words.push({
        x0: Number(m[1]),
        y0: Number(m[2]),
        x1: Number(m[3]),
        y1: Number(m[4]),
        text: decodeEntities(m[5] ?? ''),
      });
    }
    return { page: i + 1, width: Number(head[1]), height: Number(head[2]), words };
  });
}

export class PopplerMissingError extends Error {}

/** Run `pdftotext -bbox` on a PDF and return the XHTML text. */
export function extractBbox(pdfPath: string): string {
  const probe = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' });
  if (probe.error) {
    throw new PopplerMissingError(
      'pdftotext (poppler-utils) was not found on this machine. Install it first, for example: ' +
        '`sudo dnf install poppler-utils`, `sudo apt install poppler-utils` or `brew install poppler`.',
    );
  }
  const run = spawnSync('pdftotext', ['-bbox', pdfPath, '-'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (run.status !== 0) {
    throw new Error(`pdftotext failed (exit ${run.status}): ${run.stderr}`);
  }
  return run.stdout;
}
