# DECISIONS — SongHub Songbook

**Project:** songhub-songbook
**Date:** 2026-11-21

Record every significant technical decision here with rationale. Update if a decision changes.

---

## Design & Intake

### D-000 — Design source
**Decision:** **(A)** Mockups are generated in Stitch and reviewed by the client before any UI code.
**Date:** 2026-11-21

### Design — Stitch (Phase 2.5)
- **Stitch project ID:** `3647563876723315340` (title `songhub-songbook`)
- **Shared-components spec:** APPROVED 2026-11-21. Full spec in `docs/SHARED_COMPONENTS.md` (the contract every screen and UI ticket must match).
- **Side questions defaulted to the recommendations when approving:** one search box with no toggle, dark default with a theme toggle, light-theme screen included, search at the top.
- **Design system:** `assets/15444696108279318065` "SongHub Songbook". Stitch reports roundness ROUND_EIGHT (12 was requested) and derives primary `#f4bf28` / background `#0d0e13` instead of `#FFC933` / `#0E0F14`. **Frontend builds from the spec hexes in `docs/SHARED_COMPONENTS.md`, never from Stitch's token values.**
- **Screens (mobile, 780x1768 = 2x of 390x884).** Local copies of the screenshots are in `docs/design/`.
  | # | Screen | Stitch screen ID | Status |
  |---|--------|------------------|--------|
  | 1 | Home / pre-typing | `0807d60cd063434db876bd44bcca9f1d` | fix attempt did not apply: HTML `391ba416...` still has the avatar (verified 2026-11-21) |
  | 2 | Title results (dark) | `dba15038ad424bc0870b9bda98d7a5f3` | matches spec |
  | 3 | Artist matches | `78fdcd40fd754870beb994eb1e52fdb2` | fix reported by the edit tool; NOT verified (stored screenshot is stale) |
  | 4 | Artist song list | `5dc2575d036547dca5a036307d289c34` | fix reported by the edit tool; NOT verified (stored screenshot is stale) |
  | 5 | No results | `81a9b231de094262a8aa7b9dbe358696` | fix attempt did not apply: HTML `1dcf5e31...` still has back arrow, avatar and 32px clear button (verified 2026-11-21) |
  | 6 | Title results (light) | `bf810fe144a3403e97e1faca4d8724c8` | matches spec |
- **Superseded drafts (cannot be deleted via the API; ignore, delete in the Stitch UI):** `55370629732942bbaadfff64a92f32b3`, `45e864ecd10e4bc783db7b9a085fb0b3`, `7e2b88d2792d4073ad065f1a012a50ac`, `ce9f2e0353494d26abab5ef90e5da911`, `2bda7c1a47014754be8f28fcdd9a79c8`.
- **Approval (client, 2026-11-21):** the design **direction and `docs/SHARED_COMPONENTS.md` are approved**. Screens 2 and 6 (title results, dark and light) are the approved visual references. Screens 1, 3, 4 and 5 are **layout references only**: Stitch's edit tool did not reliably apply fixes, so the frontend builds from the spec text, not those pixels.
- **Do NOT copy from the Stitch screens (known deviations from the spec):**
  - any person/avatar button in the header (header = wordmark with accent music note + the sun/moon toggle only)
  - a back arrow in the header (the only back chevron is in the artist heading block)
  - song numbers in a monospace or non-Inter font, or in white (they are Inter 800, 36/40, accent colour, tabular)
  - a blue search-box border (focus border is 2px accent) and a white music-note icon (accent)
  - a clear (X) button smaller than 48x48 or clipped at the field edge; a wordmark smaller than 20/24 or an icon smaller than 24px; an accent-coloured magnifier (it is the muted colour)
  - Stitch's own tokens (roundness 8, `#f4bf28`, `#0d0e13`): use the spec hexes
- **Frontend review rule:** each UI ticket is checked against the spec text and the two approved screens, not against the four layout references.

### Intake answers (client, 2026-11-21)
| # | Question | Answer |
|---|----------|--------|
| 1 | Typing behaviour | Typo-forgiving title search |
| 2 | Artist search | Lists all of an artist's songs, including songs where they are featured; spelling variants of the same artist are merged |
| 3 | Results display | The song number is the largest element on each result |
| 4 | Users | Guests on phones. Mobile-first |
| 5 | Extras | None. Fast and single-purpose for now (no favourites, no history, no offline/installable app) |
| 6 | Name | `songhub-songbook` |
| 7 | Updates | Re-running the import script on a new PDF is enough. No admin screen |

---

## Stack

| Layer | Choice | Version (latest stable at 2026-11-21) | Rationale |
|-------|--------|---------|-----------|
| Framework | Next.js (app router), static export | 16.4.6 | Workflow default; the app is a static page plus a data file, so a static export deploys cleanly to Vercel with no server |
| UI library | React | 19.3.1 | Ships with Next.js |
| Language | TypeScript, strict | 6.0.3 (pinned at T001) | Workflow default. TypeScript 7 is not used: typescript-eslint 8.73.0 peers `typescript <6.1.0`, so TS 7 would break lint. Revisit as its own ticket when typescript-eslint supports 7 |
| Styling | Tailwind CSS | 4.3.5 | Workflow default |
| Search | MiniSearch | 7.2.0 | Prefix and fuzzy matching over ~47K documents in the browser; index can be pre-built at build time and loaded as JSON |
| Unit tests | Vitest | 5.1.1 | Fast, TypeScript-native; used for the parser and the search ranking |
| Lint | ESLint | 10.15.0 | Static gate alongside the type check |
| Backend | None | | Nothing to store and no one to log in |
| Database / ORM | None | | The song book is read-only data shipped with the app |
| Auth | None | | Public, read-only |
| Package manager | npm 10.9.8 / Node 22.23.1 | | Workflow default |
| Deployment | Vercel | | Client request. Confirm account/team and public-visibility with the client immediately before the first deploy |

---

## Architectural Decisions

### A-001 — Data is built once, shipped as static JSON
**Decision:** A Node import script parses the PDF into a normalised dataset (songs and a merged artist list) that is committed or generated at build time and shipped as static files. The browser loads it once and searches locally.
**Rationale:** Results appear as the user types with no network round-trip, it works on a poor venue connection once loaded, and there is no server to run or pay for.
**Alternatives considered:** A server-side search API with a database (more moving parts for a read-only list); a hosted search service (a cost and a dependency for no gain at ~47K rows).
**Date:** 2026-11-21

### A-002 — Artist spelling variants are merged conservatively
**Decision:** Variants are merged when they are the same after normalising case, punctuation, quotes, underscores, spacing and `&`/`and`. Anything looser (near-miss spellings) is listed in a review report for the client instead of being merged automatically.
**Rationale:** A wrong merge hides one artist's songs under another, which is worse than a duplicate entry. The client asked for variants to be merged, so the review report is how the borderline cases get decided.
**Date:** 2026-11-21

### A-003 — Featured artists
**Decision:** An artist field such as `X ft. Y` is split so that the song is listed under both X and Y.
**Rationale:** Client wants "all songs by the artist" to include features.
**Date:** 2026-11-21

---

### A-004 — Scaffold layout (T001)
**Decision:** The app lives at the project root (this folder is the repo). Next.js 16.4.6 app router with `output: 'export'` and `images.unoptimized`; Tailwind 4 CSS-first via `@tailwindcss/postcss`; ESLint flat config (`eslint-config-next` core-web-vitals + typescript); Vitest in the node environment.
```
src/app/        layout.tsx (Inter via next/font, self-hosted at build), page.tsx, globals.css (design tokens, both themes)
src/lib/        pure logic (tokens.ts for now); unit-tested
src/components/ created by the first UI ticket
tests/unit/     Vitest tests;  tests/e2e/ is added with Playwright
data/source/    git-ignored input folder for the source PDF (not committed)
docs/           SHARED_COMPONENTS.md and design screenshots
```
Config: `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.mts`, `tsconfig.json` (strict, `noUncheckedIndexedAccess`, `@/*` -> `src/*`), `.nvmrc` (22.23.1), `.npmrc` (`engine-strict`).
Scripts: `typecheck`, `lint`, `test`, `qa` (typecheck && lint && test), `build`, `dev`.
Tokens: defined once as CSS variables in `globals.css` (`:root` = dark, `[data-theme="light"]` = light) and exposed to Tailwind through `@theme inline` (`bg-bg`, `text-text-secondary`, `text-accent`, ...). `src/lib/tokens.ts` lists the token names; a unit test checks every token exists in both themes.
**Date:** 2026-11-21

### Pinned versions installed (T001, exact, no ranges)
next 16.4.6, react / react-dom 19.3.1, typescript 6.0.3, tailwindcss + @tailwindcss/postcss 4.3.5, postcss 8.5.33, vitest 5.1.1, jsdom 31.0.1, eslint 10.15.0, typescript-eslint 8.73.0, eslint-config-next 16.4.6, @types/node 22.20.5, @types/react 19.3.0, @types/react-dom 19.3.0. Node 22.23.1, npm 10.9.8. Installed with plain `npm ci` (no `--force`, no `--legacy-peer-deps`), but with three non-fatal `ERESOLVE overriding peer dependency` warnings: `eslint-plugin-import`, `eslint-plugin-jsx-a11y` and `eslint-plugin-react` (pulled in by `eslint-config-next`) cap their eslint peer at ^9 while eslint 10.15.0 is installed. Install, lint and build all work. Revisit when `eslint-config-next` widens the range; pinning eslint to 9.x is the fallback if lint breaks.

## Breaking Changes / Gotchas

- The source PDF is two columns per page with fixed positions, and long titles or artist names wrap onto a second line, which can separate a number from its title. The import must use word positions, not plain line text, and must report any row it cannot read cleanly.
- TypeScript 7 is the newest tag but is not used: typescript-eslint 8.73.0 requires `typescript >=4.8.4 <6.1.0`, so the project is pinned to 6.0.3 (see Stack).
- Inter comes from `next/font/google`: the font files are downloaded at build time and served from the app's own `out/_next/static/media/`, so there is no runtime request to a font CDN. The build machine needs network access on the first build.
- The Vitest config is `vitest.config.mts` (not `.ts`) to avoid Vite's ESM-in-CJS config warning, since `package.json` has no `"type": "module"`.
- `npm ls` shows `@emnapi/runtime` and `@img/sharp-wasm32` as extraneous: optional platform packages pulled in by Next.js, harmless.
