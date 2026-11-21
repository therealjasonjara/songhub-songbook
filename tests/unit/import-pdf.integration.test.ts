import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importPdf } from '../../scripts/import/pipeline.ts';

const dir = join(process.cwd(), 'data', 'source');
const pdf = existsSync(dir) ? readdirSync(dir).find((f) => f.toLowerCase().endsWith('.pdf')) : undefined;

if (!pdf) {
  console.warn('SKIPPED import integration test: no PDF in data/source/ (the source PDF is gitignored).');
}

describe.skipIf(!pdf)('import: real PDF', () => {
  it('parses a sane total with nothing dropped silently, deterministically', () => {
    const path = join(dir, pdf ?? '');
    const a = importPdf(path);
    const { result } = a;
    expect(result.songs.length).toBeGreaterThanOrEqual(47000);
    expect(result.songs.length).toBeLessThanOrEqual(48000);
    const rejectedAnchors = result.rejects.reduce((s, r) => s + r.anchors, 0);
    expect(result.songs.length + rejectedAnchors).toBe(result.anchors);
    for (const s of result.songs) {
      expect(Number.isInteger(s.n) && s.n >= 1 && s.n <= 99999).toBe(true);
    }
    const b = importPdf(path);
    expect(b.songsJson).toBe(a.songsJson);
    expect(b.reportMd).toBe(a.reportMd);
  }, 120_000);
});
