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

### A-005 — PDF import: word positions, band-based row assembly (T002)
**Decision:** `npm run import` (`scripts/import/`) extracts word boxes with poppler (`pdftotext -bbox`, no new dependency) and rebuilds rows from geometry, not from line text. Output: `data/work/songs.raw.json` (gitignored; `n`, `t`, `a`, plus `page` and `col` for traceability) and `data/reports/import.md` (committed).
**Rule (derived from the real PDF, 384 pages):**
1. Each page has a header band with `NO.` and `ARTIST` once per column. Columns are split at the right `NO.` header minus 8pt. Within a column, cells sit at fixed offsets from those headers: number words `x0 < NO.x0 + 24`; title words up to `ARTIST.x0 - 31.5`; artist words from there (artists start exactly at `ARTIST.x0 - 31.0`, so the boundary has ~30pt of margin both sides in this PDF). Words above the header bottom, and the footer (words within 28pt of the page bottom: running footer and "Page N of M"), are ignored and counted.
2. Title/artist words are grouped into visual lines (y within 2pt; title and artist baselines differ by 0.3pt). Consecutive lines less than 10.5pt apart form one row band: wrapped lines are 9pt apart, separate rows are at least 11.5pt apart (measured over the whole PDF, nothing in between).
3. The number is attached to the band whose first-to-last line span contains it (wrapped rows print the number vertically centred, so it matches neither line). A band with exactly one number becomes a row, joining wrapped lines with a single space in reading order. A band with no number, two or more numbers, a non-integer in the number column, or a number outside 1..99999 is rejected into the report with page, column and raw text; a number with no text is kept with empty `t` and `a`.
4. Accounting is checked: rows parsed + anchors in rejects = number anchors detected; the CLI exits non-zero if it does not balance or a page has no headers. Output is deterministic (sorted by `n`, ties in document order; no timestamps).
**Result on the supplied PDF:** 47,399 rows, 0 rejects, 0 duplicate numbers, 1,616 rows reassembled from wrapped lines, 39 rows with an empty artist (genuinely blank in the PDF).
**Tooling:** runs on Node 22.23.1's built-in TypeScript type stripping (`node scripts/import/index.ts`); no `tsx` or other new devDependency. Constraints this imposes: relative imports carry the `.ts` extension (`allowImportingTsExtensions`), and only erasable TypeScript syntax is allowed (`erasableSyntaxOnly`: no enums or parameter properties). `package.json` has no `"type": "module"`, so the script passes `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` to silence Node's reparse notice.
**Gotchas for later tickets (the data is as printed in the PDF):**
- The PDF truncates long values itself: titles at 50 characters and artists at 39, often ending in `...` (458 rows) or cut mid-word (e.g. `Nous N'irons Plus Au Boi`, `Franco De V,`). The importer does not and cannot restore them.
- Source quirks are preserved verbatim: `I Still HavennT Found What InM Looking For`, `_the Take over the Breaks Over_`, `Feat.Riha.`, titles equal to the artist (10 rows), single letters separated by spaces (`A B C`, `U 2`, `S & M`: `pdftotext -layout` joins some of these, the word boxes keep the space).
- The importer decodes HTML entities in poppler's output (`&apos;`, `&amp;`, ...). The real PDF produced no leftover entities (QA counted 0).
- Six rows contain non-ASCII damage inherited from the source PDF (`¬` in e.g. `Trafn¬nC Lights`, numbers 41552, 41562, 41663, 41700, 41711, and one curly apostrophe in 17536). Search normalisation (T004) must tolerate them; the importer keeps them as printed.
- `pdftotext` (poppler-utils) must be installed; the importer says so if it is missing. It expects exactly one PDF in `data/source/`, or a path argument: `npm run import -- <file>`.
**Date:** 2026-11-21

### A-006 — Artist build and the shipped data format (T003)
**Decision:** `npm run build:data` (`scripts/import/build-data.ts`) reads `data/work/songs.raw.json` and writes `public/data/songs.json`, `public/data/artists.json` and `data/reports/artists-review.md`. Output is deterministic (sorted everywhere, no timestamps; two runs are byte-identical). `npm run import` is unchanged.
**Format (columnar, to keep it small; typed loader and encoder in `src/lib/dataset.ts`):**
- `songs.json`: `{"v":1,"n":[...],"t":[...],"a":[...],"ar":[...]}`, parallel arrays. `ar[i]` is an index into the artists array: a bare number for one artist, a list for several (main artist first, then featured).
- `artists.json`: `{"v":1,"artists":[[id,name,aliases,count],...]}`, ordered by count descending then key.
**Rules:**
1. Normaliser (`src/lib/normalize.ts`, pure, shared with search in T004): NFKD and strip accents, lowercase, `&` becomes `and`, apostrophes, quotes and dots dropped without a gap, every other non-letter/digit (brackets, hyphen, comma, underscore, `¬`) becomes a space.
2. Featured split only on `ft`, `ft.`, `feat`, `feat.`, `featuring` (case-insensitive, word-bounded, glued `Feat.Riha.` tolerated). Never on `&`, `+`, `and`, `,`. A marker glued to the previous word (`Horizonft. Lil Uzi Ver`) splits only as `ft.`/`feat.` with the dot, 4+ letters before it and a space then a capital after it (`Daft. Punk`, `Draft.Beat` stay whole; a long word ending in `ft.` before a capitalised word, such as `Aircraft. Band`, would wrongly split). A marker opened inside brackets ends the featured name at the closing bracket (`FIFTY FIFTY(Feat. Kaliii)From Bar` gives `Kaliii`). If the main part or any part would be empty (`Feat.Riha.`, `Ft. David Guetta`, `Little Feat`, a cut-off second marker) the credit is not split and is listed in the report (e); a trailing marker left on the kept-whole name is removed (`Imanbek ft...` gives `Imanbek`) unless it is plainly part of the name (`Little Feat`).
3. **`with` credits are not split** (client decision): "with" is also part of names and bands. The 39 distinct credits are listed in the review report (c) for the client.
4. **Category-like names stay as artists** (`Unknown`, `Gospel`, `Ilocano Song`, `Visayan Song`, ...): a user can search them and open the list. The top 40 are listed in the report (b) with an automatic category flag; hiding or dropping any is the client's call. Songs with an empty printed artist are listed under `Unknown` (their `a` stays empty).
5. Truncated credits (PDF cuts at 39 characters): `a` keeps the printed text; the artist name drops a trailing `...` and dangling `&`/`,`/`+`. A cut name is never guessed back to a longer one.
6. Merge: identical normalised names are one artist. Canonical name = most frequent spelling, ties longest then alphabetical; other spellings are `aliases` (by frequency, then length, then alphabetical). Ids = slug of the normalised canonical name (spaces to `-`, unicode letters kept), with `-2`, `-3` on a collision (plain keys cannot collide; only a `keepSeparate` spelling can, so the suffix code stays and is tested), assigned in key order, so they do not depend on row order or counts. No fuzzy auto-merging (A-002).
7. Approved merges: `data/artist-merges.json` is a list of merge entries `{ "names": [...], "ids": [...], "into": "Display Name" }`; sources are merged into `into`, which becomes the display name. Unknown names or ids are reported, not fatal. An entry `{ "keepSeparate": ["B.O.B", "Bob"] }` (names or ids, 2+ spellings of one artist; case, spacing and trailing dots do not count as different) keeps those spellings from merging: each listed spelling becomes its own artist with an id from its lowercased spelling (`b.o.b`, `bob`); unlisted spellings stay with the plain artist. The committed file separates `B.O.B`/`Bob` (rapper vs a different act) and `M.I.A.`/`Mia` ("Paper Planes" vs "Bad Bunny"); every other dotted-initialism or short-name merge is listed in report section (f) for the client to confirm.
8. The review report finds near-matches as a head artist plus the names directly near it (no chaining): 1 character apart (6+ letters) or 2 apart (9+), same first word; a name cut short; one extra middle word; spacing only; leading "the" only. Collaboration credits are not matched. The 150 biggest groups are listed.
**Size (real data, 47,399 songs, 14,482 artists; Node zlib level 9, the same measurement the build and the report use):** songs 2,055,360 B (764,422 gzipped), artists 575,018 B (190,470 gzipped); **954,892 B gzipped total, about 0.91 MB** against the 1.5 MB budget.
**Date:** 2026-11-21

### Pinned versions installed (T001, exact, no ranges)
next 16.4.6, react / react-dom 19.3.1, typescript 6.0.3, tailwindcss + @tailwindcss/postcss 4.3.5, postcss 8.5.33, vitest 5.1.1, jsdom 31.0.1, eslint 10.15.0, typescript-eslint 8.73.0, eslint-config-next 16.4.6, @types/node 22.20.5, @types/react 19.3.0, @types/react-dom 19.3.0. Node 22.23.1, npm 10.9.8. Installed with plain `npm ci` (no `--force`, no `--legacy-peer-deps`), but with three non-fatal `ERESOLVE overriding peer dependency` warnings: `eslint-plugin-import`, `eslint-plugin-jsx-a11y` and `eslint-plugin-react` (pulled in by `eslint-config-next`) cap their eslint peer at ^9 while eslint 10.15.0 is installed. Install, lint and build all work. Revisit when `eslint-config-next` widens the range; pinning eslint to 9.x is the fallback if lint breaks.

## Breaking Changes / Gotchas

- The source PDF is two columns per page with fixed positions, and long titles or artist names wrap onto a second line, which can separate a number from its title. The import must use word positions, not plain line text, and must report any row it cannot read cleanly.
- TypeScript 7 is the newest tag but is not used: typescript-eslint 8.73.0 requires `typescript >=4.8.4 <6.1.0`, so the project is pinned to 6.0.3 (see Stack).
- Inter comes from `next/font/google`: the font files are downloaded at build time and served from the app's own `out/_next/static/media/`, so there is no runtime request to a font CDN. The build machine needs network access on the first build.
- The Vitest config is `vitest.config.mts` (not `.ts`) to avoid Vite's ESM-in-CJS config warning, since `package.json` has no `"type": "module"`.
- `npm ls` shows `@emnapi/runtime` and `@img/sharp-wasm32` as extraneous: optional platform packages pulled in by Next.js, harmless.
