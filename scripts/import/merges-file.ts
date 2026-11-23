import { existsSync, readFileSync } from 'node:fs';
import type { MergeEntry } from './artists.ts';

export type MergesFile =
  | { kind: 'ok'; merges: MergeEntry[] }
  | { kind: 'missing'; merges: MergeEntry[]; warning: string }
  | { kind: 'error'; message: string };

export const MISSING_MERGES_WARNING =
  'WARNING: data/artist-merges.json was not found, so NO merge decisions were applied (the dataset id will differ from a build with the file). Check the file name and folder; to start with no decisions the file must contain []. Continuing.';

/** Read the owner's merge decisions. A missing file warns (not fatal); unreadable JSON or a non-list is reported as one clear line. */
export function readMergesFile(path: string): MergesFile {
  if (!existsSync(path)) return { kind: 'missing', merges: [], warning: MISSING_MERGES_WARNING };
  const text = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const msg = (e as Error).message;
    const pos = /position (\d+)/.exec(msg)?.[1];
    const where = pos === undefined ? '' : ` near position ${pos}`;
    return {
      kind: 'error',
      message: `data/artist-merges.json is not valid JSON${where}: a comma or bracket is missing or extra. Fix it and run \`npm run build:data\` again. (${msg})`,
    };
  }
  if (!Array.isArray(parsed)) return { kind: 'error', message: 'data/artist-merges.json must be a JSON list.' };
  return { kind: 'ok', merges: parsed as MergeEntry[] };
}
