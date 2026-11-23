import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MISSING_MERGES_WARNING, readMergesFile } from '../../scripts/import/merges-file.ts';

/** T011: the owner edits data/artist-merges.json by hand; a missing file or a typo must be loud, not silent. */
const root = process.cwd();
const scratch = mkdtempSync(join(tmpdir(), 'merges-file-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('readMergesFile', () => {
  it('a missing file is a warning, not a failure, and applies no rules', () => {
    const r = readMergesFile(join(scratch, 'nope.json'));
    expect(r.kind).toBe('missing');
    if (r.kind === 'missing') {
      expect(r.merges).toEqual([]);
      expect(r.warning).toBe(MISSING_MERGES_WARNING);
      expect(r.warning).toContain('data/artist-merges.json was not found');
    }
  });

  it('reads a list', () => {
    const p = join(scratch, 'ok.json');
    writeFileSync(p, '[ { "keepSeparate": ["a", "b"] } ]');
    const r = readMergesFile(p);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.merges).toHaveLength(1);
  });

  it('bad JSON gives one line that names the file and the position, with no stack trace', () => {
    const p = join(scratch, 'bad.json');
    writeFileSync(p, '[\n  { "keepSeparate": ["a", "b"] }\n  { "keepSeparate": ["c", "d"] }\n]');
    const r = readMergesFile(p);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.message).toContain('data/artist-merges.json is not valid JSON near position');
      expect(r.message).toMatch(/position \d+/);
      expect(r.message).not.toContain('\n');
      expect(r.message).not.toMatch(/node:internal|\n\s+at /);
    }
  });

  it('a JSON value that is not a list is rejected', () => {
    const p = join(scratch, 'obj.json');
    writeFileSync(p, '{"a":1}');
    expect(readMergesFile(p)).toEqual({ kind: 'error', message: 'data/artist-merges.json must be a JSON list.' });
  });
});

/** Runs the real build:data script in a scratch project folder (its own data/ and public/), never touching the repo's files. */
function runBuild(mergesText: string | null) {
  const dir = mkdtempSync(join(scratch, 'proj-'));
  mkdirSync(join(dir, 'data', 'work'), { recursive: true });
  const rows = [
    { n: 1, t: 'Song One', a: 'Alpha', page: 1, col: 1 },
    { n: 2, t: 'Song Two', a: 'Beta', page: 1, col: 1 },
  ];
  writeFileSync(join(dir, 'data', 'work', 'songs.raw.json'), JSON.stringify(rows));
  if (mergesText !== null) writeFileSync(join(dir, 'data', 'artist-merges.json'), mergesText);
  const res = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', join(root, 'scripts/import/build-data.ts')], { cwd: dir, encoding: 'utf8' });
  const review = (() => {
    try {
      return readFileSync(join(dir, 'data', 'reports', 'artists-review.md'), 'utf8');
    } catch {
      return null;
    }
  })();
  return { ...res, review };
}

describe('npm run build:data and the merge file', () => {
  it('missing file: exit 0, a warning on screen and a WARNING line in the report Summary', () => {
    const r = runBuild(null);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('data/artist-merges.json was not found');
    expect(r.review).toContain('**WARNING: `data/artist-merges.json` was not found');
  });

  it('present file: no warning anywhere', () => {
    const r = runBuild('[]');
    expect(r.status).toBe(0);
    expect(r.stderr).not.toContain('was not found');
    expect(r.review).not.toContain('WARNING');
  });

  it('bad JSON: exit 1, one clear line naming the file and position, no stack trace, nothing written', () => {
    const r = runBuild('[ { "keepSeparate": ["a","b"] } { "keepSeparate": ["c","d"] } ]');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('data/artist-merges.json is not valid JSON near position');
    expect(r.stderr).not.toContain('SyntaxError');
    expect(r.stderr).not.toMatch(/node:internal|\n\s+at /);
    expect(r.review).toBeNull();
  });
});
