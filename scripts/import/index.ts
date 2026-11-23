import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PopplerMissingError } from './bbox.ts';
import { importPdf } from './pipeline.ts';

function main(): number {
  const root = process.cwd();
  const explicit = process.argv[2];
  let pdf: string;
  if (explicit) {
    pdf = resolve(explicit);
  } else {
    const dir = join(root, 'data', 'source');
    let found: string[] = [];
    try {
      found = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
    } catch {
      /* folder missing: handled below */
    }
    if (found.length !== 1) {
      console.error(
        found.length === 0
          ? 'No PDF found. Put the song book PDF in data/source/ and run `npm run import` again.'
          : `Expected exactly one PDF in data/source/, found ${found.length}: ${found.join(', ')}. ` +
              'Remove the extras or pass the file: `npm run import -- data/source/<file>.pdf`.',
      );
      return 1;
    }
    pdf = join(dir, found[0]!);
  }

  let out;
  try {
    out = importPdf(pdf);
  } catch (e) {
    console.error(e instanceof PopplerMissingError ? e.message : `Import failed: ${(e as Error).message}`);
    return 1;
  }

  const workDir = join(root, 'data', 'work');
  const reportDir = join(root, 'data', 'reports');
  mkdirSync(workDir, { recursive: true });
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(workDir, 'songs.raw.json'), out.songsJson);
  writeFileSync(join(reportDir, 'import.md'), out.reportMd);

  const { result } = out;
  const rejectedAnchors = result.rejects.reduce((s, r) => s + r.anchors, 0);
  console.log(`Parsed ${result.songs.length} rows from ${result.pages.length} pages.`);
  console.log(`Reassembled from wrapped lines: ${result.reassembly.rows}. Rejected: ${result.rejects.length}.`);
  console.log('Wrote data/work/songs.raw.json and data/reports/import.md');
  if (result.songs.length + rejectedAnchors !== result.anchors) {
    console.error('Row accounting does not balance: rows were dropped. See the report.');
    return 1;
  }
  if (result.rejects.some((r) => r.col === null)) {
    console.error('At least one page could not be parsed at all. See the report.');
    return 1;
  }
  return 0;
}

process.exitCode = main();
