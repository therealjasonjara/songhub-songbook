/**
 * Rasterises the brand assets in public/ from the sources in scripts/brand/ (Playwright's Chromium; no extra dependency).
 *   node scripts/brand/build.mjs
 * Writes: public/apple-touch-icon.png (180x180), public/favicon.ico (32 + 48 PNG frames), public/og.png (1200x630).
 * public/favicon.svg is the hand-kept source of the vector favicon. Colours and the note path come from docs/SHARED_COMPONENTS.md
 * and src/components/icons.tsx (a unit test checks the path still matches).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '..', '..', 'public');
const browser = await chromium.launch();

async function shot(url, width, height, { svg = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  if (svg) {
    const markup = readFileSync(new URL(url), 'utf8').replace(/ width="\d+" height="\d+"/, ` width="${width}" height="${height}"`);
    await page.setContent(`<body style="margin:0;background:transparent">${markup}</body>`);
  } else {
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
  }
  const png = await page.screenshot({ omitBackground: true, type: 'png' });
  await page.close();
  return png;
}

writeFileSync(join(pub, 'apple-touch-icon.png'), await shot(pathToFileURL(join(here, 'apple-touch-icon.svg')).href, 180, 180, { svg: true }));
writeFileSync(join(pub, 'og.png'), await shot(pathToFileURL(join(here, 'og.html')).href, 1200, 630));

// favicon.ico with two PNG-compressed frames (32 and 48)
const frames = [];
for (const s of [32, 48]) frames.push({ s, png: await shot(pathToFileURL(join(pub, 'favicon.svg')).href, s, s, { svg: true }) });
const head = Buffer.alloc(6);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(frames.length, 4);
let offset = 6 + 16 * frames.length;
const dirs = frames.map(({ s, png }) => {
  const d = Buffer.alloc(16);
  d[0] = s; d[1] = s; d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6); d.writeUInt32LE(png.length, 8); d.writeUInt32LE(offset, 12);
  offset += png.length;
  return d;
});
writeFileSync(join(pub, 'favicon.ico'), Buffer.concat([head, ...dirs, ...frames.map((f) => f.png)]));
await browser.close();
