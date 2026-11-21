import { test as base, expect } from '@playwright/test';
import { installMetrics } from './init';

interface Fixtures {
  /** console errors and uncaught page errors, collected from before the first navigation. */
  problems: string[];
}

/** `test` with the metrics init script on every page, and a `problems` collector for tests that assert "no console errors". */
export const test = base.extend<Fixtures>({
  page: async ({ page }, provide) => {
    await page.addInitScript(installMetrics);
    await provide(page);
  },
  problems: async ({ page }, provide) => {
    const found: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') found.push(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => found.push(`pageerror: ${e.message}`));
    await provide(found);
  },
});

export { expect };
