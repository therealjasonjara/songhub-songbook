# SongHub Songbook

A fast, mobile-first lookup for the SongHub karaoke song book. Type a title to get the song number, or an artist to list their songs.

## Develop

```
nvm use          # Node 22.23.1
npm ci
npm run dev
npm run qa       # typecheck, lint, unit tests
npm run build    # static export to out/
npm run qa:full  # qa, then build, then the Playwright end-to-end suite (the gate)
```

## End-to-end tests

The suite in `tests/e2e/` runs Playwright (Chromium only) against the built site in `out/`, served by `scripts/serve-out.mjs` on port 4173 (started by `playwright.config.ts`). It needs a build first; `npm run qa:full` does that.

```
npx playwright install chromium   # once on a fresh machine or CI runner (the browser is not in node_modules)
npm run build
npm run test:e2e                  # the whole suite; `npm run e2e` is the same
npx playwright test search        # one area (file name), e.g. search, artists, accessibility, seo
npx playwright show-trace test-results/<test>/trace.zip   # a trace is kept for each failed test
```

Two projects: `mobile` (390x844, the default) and `desktop` (1280x800, the layout specs only). Areas: search, artists and history, theme and URL, loading and error, layout spec table, responsive widths, large text, accessibility (axe-core, keyboard, screen-reader names), contrast and tap targets, SEO, performance.

Throttled-mobile performance numbers (not part of `qa:full`; about 5 minutes): `npm run measure:perf` runs Wi-Fi and Slow 4G at 4x and 6x CPU slowdown, three cold-cache runs each, and prints a table. `npm run measure:browser` is the older load-path measurement (A-008). Real phones: see `docs/DEVICE-CHECKLIST.md`.

The full re-import and deploy runbook is added in ticket T011.

## Commit rules

This repository ships as the client's own work. No commit message, pull request, issue comment, tag, release note, code comment or document may carry AI attribution: no AI co-author trailer, no "generated with" footer, no assistant or model names.

## Search visibility

The site is public but hidden from search engines (DECISIONS.md, A-015): `noindex, nofollow` in the page head and in an `X-Robots-Tag` header (`vercel.json`), and `public/robots.txt` allows crawling on purpose (`Disallow: /` would stop Slack and some other apps from building a link preview). This is hiding, not protection: anyone with the link can use the site and fetch `/data/*.json`. To make it indexable, remove the noindex in those two places (listed in A-015).
