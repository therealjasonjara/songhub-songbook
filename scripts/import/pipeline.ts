import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { extractBbox, parseBbox } from './bbox.ts';
import { parsePages, type ParseResult } from './parse.ts';
import { renderReport, serializeSongs } from './report.ts';

export interface ImportOutput {
  result: ParseResult;
  songsJson: string;
  reportMd: string;
}

/** PDF -> parsed rows, dataset text and report text. Pure apart from reading the PDF and running pdftotext. */
export function importPdf(pdfPath: string): ImportOutput {
  const pages = parseBbox(extractBbox(pdfPath));
  const result = parsePages(pages);
  const sourceSha256 = createHash('sha256').update(readFileSync(pdfPath)).digest('hex');
  return {
    result,
    songsJson: serializeSongs(result.songs),
    reportMd: renderReport({ result, sourceName: basename(pdfPath), sourceSha256, pageCount: pages.length }),
  };
}
