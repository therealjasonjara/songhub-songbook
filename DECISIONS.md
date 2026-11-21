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

### A-007 — Search engine: MiniSearch, ranking tiers, fuzzy values and measurements (T004)
**Decision:** `src/lib/search/` (pure TypeScript, no DOM or Node APIs, so it can run in a Web Worker) on **MiniSearch 7.2.0** (exact pin, zero dependencies and no peers). API: `buildIndex(dataset)`, `searchSongs(index, query)` -> `{ results (best 50), total, hasMore }`, `suggestArtists(index, query)` (up to 3: id, name, count), `songsByArtist(index, artistId)`; plus `serializeIndex` / `loadIndex` for a prebuilt-index delivery.
**Index:** two fields per song, the title and the printed artist credit (boost 0.4 against 1 for the title), both run through the shared normaliser (A-006 rule 1) as the tokenizer. **Dotted words:** the normaliser drops a dot without a gap (so `R.E.M.` -> `rem`; unchanged, T003 depends on it), which would hide `Mr.Brightside` from `mr brightside`. Search-side only: when a title or credit has a dot between two runs of 2+ letters/digits (`Mr.Brightside`, `Dr.Dre`, `St.Louis`), the document tokenizer indexes both the joined word (`mrbrightside`) and the split words (`mr`, `brightside`). Single-letter segments (`R.E.M.`, `L.Q.`, `B.O.B`, `U.S.A`) stay joined only, so `rem` finds R.E.M. and `r e m` is not expected to. Queries use a plain normalised tokenizer (`mr.brightside` -> `mrbrightside`, `mr brightside` -> two words, last one a prefix). The tiers below look at both spellings of the title (the better tier wins), and the typo cost uses both, so `mr brightside` is tier 0 and `mr bright` tier 2, never a fuzzy hit. Queries use AND across words, the **last typed word is a prefix**, earlier words are whole words.
**Ranking (tiers, best first; inside a tier: typo cost, MiniSearch score, shorter title, then number, so the order is deterministic):** 0 whole title equals the query; 1 title starts with the query as whole words; 2 title starts with the query (last word partial); 3 the query is a phrase starting at a title word (whole words); 4 same with the last word partial; 5 every typed word starts some title word; 6 every word found in title + credit (a title-only match always outranks a credit-only match, since tiers 0-5 look at the title alone); 7 needs typo tolerance, ordered by real edit distance first (so `yesturday` puts Yesterday above Yesterdays). A row that comes back from the fuzzy path but still satisfies a tier 0-5 test (for example `waste a` also returns titles with `wasted`, a word-prefix extension) keeps that better tier, so "fuzzy rows rank last" means rows that need typo tolerance, not every row the fuzzy path returned. Measured: 1 of 600 mixed queries.
**Chosen fuzzy values:** words under 4 characters: none; 4-5 characters: 1 edit; 6 or more: 2 edits (MiniSearch counts a swapped pair of letters as 2 edits). Fuzzy matching runs only when fewer than 5 songs match without it; with more real matches it would only add noise below them. Chosen by measurement (`scripts/tune-fuzzy.ts`: 600 real titles with one typo of each kind, share found in the top 50 by typed-word length): "<4:0, 4-7:1, 8+:2" found 337/600, "<4:0, 4-5:1, 6+:2" **364/600** (6-7 character words 109/109 against 82/109, because transposed letters need 2 edits), "<3:0, 3-5:1, 6+:2" 448/600 but 3-letter words with 1 edit added far more noise (29 extra rows on average against 8 on correct as-you-type queries, up to 2,879). Words under 4 characters therefore stay exact; a typo in a 3-letter last word (`thinking out lod`) is not recovered, it is matched as soon as the user types the 4th letter. Typo matches also appear for a rare title when 1-4 real matches exist (`eagles` on a tiny list also returns a 2-edit neighbour): they are always ranked last.
**One-character queries:** no MiniSearch and no scoring. One linear scan over precomputed normalised titles counts every song with a title word starting with the character (`total`); titles that start with it come first, then the others, each (shorter title, number), keeping the first 50. First call on a fresh index builds the length order once: 16.5 ms in Node; afterwards 2-3 ms. Two-character and longer queries use MiniSearch with no cap needed (see numbers).
**suggestArtists:** the normalised name or an alias starts with the normalised query (2+ characters), or the whole name is within 1 edit of the query (names of 5+ characters). A word that appears only mid-name never matches. Prefix matches rank before typo matches; each group by song count (descending) then name. One entry per artist, always shown under its canonical name (aliases are only matched). Names start from the sorted key list (binary search); typo matches only compare names of length within 1 of the query.
**Measured in Node 22.23.1 on the full dataset (47,399 songs, 14,482 artists; this machine, Linux desktop; reproduce with `scripts/measure-search.ts`):**
- Index build (`buildIndex`): **~375-385 ms** median of 5 runs, over two runs (362-422 ms; the dotted-word split added no measurable time, 106 titles), including the sorted artist keys and the per-artist song lists.
- Serialised full-text index (`MiniSearch.toJSON`): **4,100,491 B raw, 1,169,910 B gzipped** (level 9; +3,675 B raw and +1,731 B gzipped for the dotted-word split). The dataset itself is 2,630,370 B raw, 954,892 B gzipped. So a prebuilt index is **larger than the dataset** (1.5x raw, 1.22x gzipped) and, on top of the dataset (the index holds no titles), the transfer would be about 2.12 MB gzipped against the 1.5 MB budget. `loadIndex` (`MiniSearch.loadJSON`) takes ~205 ms: only about 45% cheaper than building from scratch.
- Memory: dataset objects ~10.5-12 MB, the index adds **~40-42 MB** of JS heap (about 52 MB together).
- Per query (519 queries: title prefixes of 1, 2, 3, 4, 6 and 9 characters, 60 one-edit typos, the 120 biggest artists, 60 two-word queries, 39 worst cases such as `a`, `the`, `love`, `the a`, `i love you`; each timed including `suggestArtists`): **median 1.5 ms, p95 ~13-14 ms (13.2-14.6 over runs, 13.2 and 13.5 after the dotted-word change), p99 ~21-24 ms**, worst typically 35-45 ms (a single run showed outliers of 65-140 ms, which look like a GC pause on one query, not a slow query). By kind, p95: 1 char 5 ms, 2 chars 12 ms, 3 chars 8 ms, 4 chars 11 ms, 6 chars 17 ms, 9 chars 24 ms, typos 13 ms, artists 3 ms, two-word 8 ms, worst cases 16 ms. Slowest real queries are two-word ones with a short last word (`Te Dejo M`, `Then You`) because they score many candidates. Under the 100 ms budget with a wide margin, so no candidate cap was needed beyond the one-character path.
- `songsByArtist` for the largest list (568 songs): 0.2-0.5 ms (lists are precomputed at build time).
**Runtime build vs prebuilt (for T005, which decides):** the build costs ~0.38 s in Node; on a mobile profile, roughly 3-6x slower, that is about **1.1-2.3 s inside a worker**, which is borderline against the 2 s first-results target but does not block typing; the dataset download (0.95 MB gzipped) happens in parallel. A prebuilt index would not help: it is bigger than the dataset and its load (~205 ms Node, ~0.6-1.2 s on mobile) saves less than half of the build. If the mobile number is too high, the cheaper levers are building the title-only index first and adding the credit field afterwards, or dropping the credit field, not shipping the index.
**Dotted titles (fixed in search, 2026-11-21):** 106 real titles match the dotted-word rule (222 have some letter.letter shape; the rest are initialisms or `No.9`-style, which stay joined). Every one of the 106 is found in the top 50 when its split words are typed (105 in the top 3; checked by a real-data test that loops all of them, which also checks the joined spelling). **Known data gaps this surfaced (for the client/T003, not changed here):** the PDF-truncated titles (50 characters) and credits (39) can only be found by what is printed.
**Date:** 2026-11-21

### Pinned versions installed (T001, exact, no ranges)
minisearch 7.2.0 (T004), next 16.4.6, react / react-dom 19.3.1, typescript 6.0.3, tailwindcss + @tailwindcss/postcss 4.3.5, postcss 8.5.33, vitest 5.1.1, jsdom 31.0.1, eslint 10.15.0, typescript-eslint 8.73.0, eslint-config-next 16.4.6, @types/node 22.20.5, @types/react 19.3.0, @types/react-dom 19.3.0. Node 22.23.1, npm 10.9.8. Installed with plain `npm ci` (no `--force`, no `--legacy-peer-deps`), but with three non-fatal `ERESOLVE overriding peer dependency` warnings: `eslint-plugin-import`, `eslint-plugin-jsx-a11y` and `eslint-plugin-react` (pulled in by `eslint-config-next`) cap their eslint peer at ^9 while eslint 10.15.0 is installed. Install, lint and build all work. Revisit when `eslint-config-next` widens the range; pinning eslint to 9.x is the fallback if lint breaks.

## Breaking Changes / Gotchas

- The source PDF is two columns per page with fixed positions, and long titles or artist names wrap onto a second line, which can separate a number from its title. The import must use word positions, not plain line text, and must report any row it cannot read cleanly.
- TypeScript 7 is the newest tag but is not used: typescript-eslint 8.73.0 requires `typescript >=4.8.4 <6.1.0`, so the project is pinned to 6.0.3 (see Stack).
- Inter comes from `next/font/google`: the font files are downloaded at build time and served from the app's own `out/_next/static/media/`, so there is no runtime request to a font CDN. The build machine needs network access on the first build.
- The Vitest config is `vitest.config.mts` (not `.ts`) to avoid Vite's ESM-in-CJS config warning, since `package.json` has no `"type": "module"`.
- `npm ls` shows `@emnapi/runtime` and `@img/sharp-wasm32` as extraneous: optional platform packages pulled in by Next.js, harmless.
