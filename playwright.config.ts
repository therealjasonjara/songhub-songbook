import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end suite (T009), run against the BUILT static site in `out/` (`npm run build` first; `npm run qa:full` does).
 * The site is served by scripts/serve-out.mjs, which behaves like the CDN (gzip, ETag, the same Cache-Control rules as vercel.json).
 * Chromium only. One worker: the performance specs use CDP CPU throttling and must not compete with other tests.
 *
 *   npx playwright install chromium   (a fresh machine or CI runner, once)
 *   npm run test:e2e
 */
const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

if (!existsSync('out/index.html')) {
  throw new Error('out/index.html is missing: run `npm run build` before the e2e suite (`npm run qa:full` does both).');
}

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: `node scripts/serve-out.mjs ${PORT} out`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'ignore',
  },
  projects: [
    {
      // The default: a phone (the product is used one-handed in a dark venue).
      name: 'mobile',
      testIgnore: ['**/layout-desktop.spec.ts'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
    },
    {
      // The centred 560px column on a laptop, for the layout spec table.
      name: 'desktop',
      testMatch: ['**/layout.spec.ts', '**/layout-desktop.spec.ts'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
    },
  ],
});
