import { defineConfig, devices } from '@playwright/test';

/**
 * Live-site suite (T010): the e2e specs that make sense against a real deployment, plus tests/live/*.spec.ts (CDN, TLS, headers).
 * Read-only: GETs and a browser, nothing is deployed or changed.
 *
 *   LIVE_URL=https://songhub-songbook.vercel.app npm run test:live
 *
 * Not part of `npm run qa:full` (which gates the local build with playwright.config.ts).
 * Left out on purpose: tests/e2e/performance.spec.ts (tuned for the local server; tests/live/live-performance.spec.ts is the live check)
 * and the two loading-error tests that need the in-process server (skipped inside the spec with a note, when LIVE_URL is set).
 */
const raw = process.env.LIVE_URL?.trim();
if (!raw) {
  throw new Error('LIVE_URL is not set. Run: LIVE_URL=https://<deployment> npm run test:live');
}
let origin: string;
try {
  origin = new URL(raw).origin;
} catch {
  throw new Error(`LIVE_URL is not a valid URL: ${raw}`);
}

const SHARED = [
  'e2e/search.spec.ts',
  'e2e/artists.spec.ts',
  'e2e/theme-url.spec.ts',
  'e2e/layout.spec.ts',
  'e2e/responsive.spec.ts',
  'e2e/large-text.spec.ts',
  'e2e/accessibility.spec.ts',
  'e2e/contrast-targets.spec.ts',
  'e2e/seo.spec.ts',
  'e2e/loading-error.spec.ts',
];

export default defineConfig({
  testDir: 'tests',
  testMatch: [...SHARED, 'e2e/layout-desktop.spec.ts', 'live/*.spec.ts'],
  outputDir: 'test-results/live',
  fullyParallel: false,
  workers: 2,
  retries: 1, // network flakiness only: a failure that repeats is a failure
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: origin,
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'mobile',
      testMatch: [...SHARED, 'live/*.spec.ts'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
    },
    {
      name: 'desktop',
      testMatch: ['e2e/layout.spec.ts', 'e2e/layout-desktop.spec.ts'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
    },
  ],
});
