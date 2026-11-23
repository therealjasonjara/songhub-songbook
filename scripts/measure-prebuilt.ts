/** Writes the serialised MiniSearch index to the path in argv[2] (input of scripts/measure-browser.mjs). */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseDataset } from '../src/lib/dataset.ts';
import { buildIndex, serializeIndex } from '../src/lib/search/index.ts';

const out = process.argv[2];
if (!out) throw new Error('usage: node prebuilt.mjs <output file>');
const ds = parseDataset(readFileSync('public/data/songs.json', 'utf8'), readFileSync('public/data/artists.json', 'utf8'));
writeFileSync(out, serializeIndex(buildIndex(ds)));
