import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { encodeDataset } from '../../src/lib/dataset.ts';
import { contentId } from './dataset-id.ts';
import { buildArtists, type MergeEntry, type RawSong } from './artists.ts';
import { findNearMatches, renderReview } from './review.ts';

function main(): number {
  const root = process.cwd();
  const rawPath = join(root, 'data', 'work', 'songs.raw.json');
  if (!existsSync(rawPath)) {
    console.error('data/work/songs.raw.json not found. Run `npm run import` first.');
    return 1;
  }
  const rows = JSON.parse(readFileSync(rawPath, 'utf8')) as RawSong[];
  const mergesPath = join(root, 'data', 'artist-merges.json');
  let merges: MergeEntry[] = [];
  if (existsSync(mergesPath)) {
    const parsed: unknown = JSON.parse(readFileSync(mergesPath, 'utf8'));
    if (!Array.isArray(parsed)) {
      console.error('data/artist-merges.json must be a JSON list.');
      return 1;
    }
    merges = parsed as MergeEntry[];
  }

  const { dataset, diagnostics } = buildArtists(rows, merges);
  const { songsJson, artistsJson, id } = encodeDataset(dataset, contentId);
  const gz = (s: string) => gzipSync(Buffer.from(s), { level: 9 }).length;
  const sizes = {
    songsRaw: Buffer.byteLength(songsJson),
    songsGzip: gz(songsJson),
    artistsRaw: Buffer.byteLength(artistsJson),
    artistsGzip: gz(artistsJson),
  };
  const near = findNearMatches(dataset.artists);

  const outDir = join(root, 'public', 'data');
  const reportDir = join(root, 'data', 'reports');
  mkdirSync(outDir, { recursive: true });
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(outDir, 'songs.json'), songsJson);
  writeFileSync(join(outDir, 'artists.json'), artistsJson);
  writeFileSync(join(reportDir, 'artists-review.md'), renderReview(dataset.artists, diagnostics, near, sizes));

  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  console.log(`Dataset id ${id}.`);
  console.log(`Songs: ${dataset.songs.length}. Artists: ${diagnostics.artistsAfterMerge} (spellings ${diagnostics.distinctSpellings}, after auto-merge ${diagnostics.artistsBeforeMerge}).`);
  console.log(`Songs with featured artists: ${diagnostics.songsWithFeatured}. Near-match groups: ${near.length}.`);
  console.log(`songs.json ${kb(sizes.songsRaw)} (${kb(sizes.songsGzip)} gz), artists.json ${kb(sizes.artistsRaw)} (${kb(sizes.artistsGzip)} gz), total ${kb(sizes.songsGzip + sizes.artistsGzip)} gz`);
  if (diagnostics.mergeIssues.length) console.warn(`${diagnostics.mergeIssues.length} problem(s) in data/artist-merges.json, see the report.`);
  if (sizes.songsGzip + sizes.artistsGzip > 1.5 * 1024 * 1024) {
    console.error('Gzipped dataset exceeds the 1.5 MB budget.');
    return 1;
  }
  return 0;
}

process.exit(main());
