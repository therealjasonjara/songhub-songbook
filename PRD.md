# PRD — SongHub Songbook

> The primary working reference. Re-read this when unclear mid-ticket, not the storyboard.

**Project:** songhub-songbook
**Date:** 2026-11-21
**Stack:** Next.js 16 (app router, static export) / TypeScript strict / Tailwind CSS 4 / MiniSearch / Vitest / Vercel. No backend, database or auth. Versions are pinned in `DECISIONS.md`.
**Design:** Stitch (D-000 = A). Contract: `docs/SHARED_COMPONENTS.md`. Approved references and known deviations: `DECISIONS.md`.

---

## Roles & Permissions

| Role | Access |
|------|--------|
| Guest | Public, read-only. Searches the song book. No login, no stored data. |

There is no admin role. The data is refreshed by re-running the import on a new PDF.

---

## Data Model

Built once by the import script, shipped as static JSON, loaded by the browser.

| Entity | Key Fields | Relations |
|--------|-----------|-----------|
| Song | `n` (number, int), `t` (title as printed), `a` (artist credit as printed), `ar` (artist ids this song is listed under) | `ar` → Artist.id |
| Artist | `id` (stable slug), `name` (canonical display name), `aliases` (other spellings merged in), `count` (songs listed, including features) | songs via `Song.ar` |
| Import report (not shipped) | rows parsed, rows rejected with page/column and raw text, rows reassembled from wrapped lines, duplicate numbers, artist-merge candidates needing review | — |

Dataset files (compact arrays to keep size small) live in `public/data/`. The source PDF is **not** committed.

---

## API Surface

None. The app makes no runtime network requests except loading its own static dataset files.

---

## Routing

| Route | Purpose |
|-------|---------|
| `/` | The whole app. Search state in the query string so the browser back button works: `/?q=hotel` for a search, `/?q=eagl&artist=eagles` for an artist view. |

Single page, static export.

---

## Business Rules

1. **Normalisation (search and artist matching):** lowercase, strip diacritics, drop apostrophes/quotes/brackets/punctuation, treat `&` and `and` alike, collapse whitespace. `'Di Ka Na Others` is found by `di ka na others`; `(I've Had) the Time of My Life` by `ive had the time`.
2. **Title search** is typo-tolerant (fuzzy) and matches anywhere in the title, with prefix matches ranked above fuzzy ones and an exact title above both. Results appear as the user types, with no search button.
3. **Result cap:** title results show the best 50, with the hint row when more matched. The search itself runs over the full set. An artist's own list is not capped.
4. **Artist suggestions:** up to 3 artists above the songs, only when the typed text strongly matches (artist name starts with it, or a close fuzzy match). Weak matches are hidden.
5. **Artist spelling variants are merged conservatively** (A-002): identical after normalising case, punctuation, quotes, underscores, spacing and `&`/`and`. Anything looser goes to the review report and is not merged automatically.
6. **Featured artists** (A-003): split a credit only on `ft.`, `feat.`, `featuring`. **Never** split on `&`, `+`, `and`, `,` (groups like Ben&Ben, Brooks & Dunn, Simon & Garfunkel are single acts). The song is listed under every featured artist and the full credit is displayed as printed.
7. **Song number is the largest element** on every song row (spec).
8. **Import must not lose rows silently.** Rows that cannot be read cleanly are reported with page and line, never dropped quietly. Duplicate song numbers are reported, not overwritten.
9. **No personal data, no cookies, no analytics.** The theme choice is not persisted beyond the session.

---

## Feature Rules by Area

### Search UI
- One input, autofocus, `inputmode=search`, no autocorrect/autocapitalize, clear button when text is present.
- Pre-typing state and "No songs found" state exactly as in the spec.
- Tapping a song row does nothing. Tapping an artist opens the artist view; the back chevron returns to the previous results.

### Performance budget
- The dataset must be usable fast on a mid-range phone on a venue connection. Target: first results within **2 s** of load on a throttled mid-range mobile profile, and each keystroke's results within **100 ms**. Dataset transfer budget: under **1.5 MB gzipped**.
- Search index is built in a Web Worker so typing never blocks. If measured index build time exceeds the budget, switch to a pre-built serialised index (T005 decides, with numbers).

### Theme
- Dark by default. A sun/moon toggle switches to light for the session. Tokens exactly as in `docs/SHARED_COMPONENTS.md`; never Stitch's drifted token values.

---

## File & Storage Conventions

- `scripts/import/` — the PDF import and normalisation scripts (Node, TypeScript).
- `data/source/` — the source PDF, gitignored.
- `public/data/` — shipped dataset files.
- `data/work/` — intermediate import output (`songs.raw.json`: `n`, `t`, `a` plus `page`, `col` for traceability), gitignored.
- `data/reports/` — import and merge-review reports (committed, so changes are reviewable).
- Re-import runbook in `README.md` (T011).

---

## Environment Variables

None.

---

## Out of Scope

- Favourites, search history, "my queue"
- Offline use or an installable app
- An admin screen for editing songs
- Accounts or login
- Lyrics, audio, video or any detail beyond number, title and artist
- Analytics
