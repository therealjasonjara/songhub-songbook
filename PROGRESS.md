# PROGRESS — SongHub Songbook

**Project:** songhub-songbook

Phase 1 (Intake), Phase 2 (Storyboard) and Phase 2.5 (Design) complete. Phase 3 (PRD and tickets) written 2026-11-21 and awaiting approval. No code before approval.

Plan: 4 sprints, 11 tickets. See `sprints/`.

| Sprint | Tickets |
|--------|---------|
| S01 Foundation and Data | T001 scaffold · T002 PDF import · T003 artists |
| S02 Search Engine | T004 engine · T005 loading and speed |
| S03 Search UI | T006 shell · T007 title results · T008 artists · T009 a11y, perf, E2E |
| S04 Release | T010 Vercel deploy · T011 runbook |

<!-- One block per ticket is added here as it is completed (Phase 5). -->

## S01 / T001 — Scaffold the app, tooling and repo ✅ (2026-11-21)

**Goal met.** A static-export Next.js app with a one-command QA gate and the design tokens in place.

- **Stack installed:** Next.js 16.4.6, React 19.3.1, TypeScript **6.0.3** (not 7: typescript-eslint peers `typescript <6.1.0`), Tailwind 4.3.5, Vitest 5.1.1, ESLint 10.15.0. Exact pins and the reasons are in `DECISIONS.md` (A-004).
- **QA:** `npm run qa` and `npm run build` exit 0; deliberate type, lint and test failures each fail their command. Static `out/`: no server code, no external URLs, Inter self-hosted (0 external requests in headless Chromium).
- **Tokens:** all 11 spec tokens match `docs/SHARED_COMPONENTS.md` hex-for-hex in both themes (checked by script); Stitch's drifted values are absent.
- **Rendered check:** 390px headless render, dark and light: correct backgrounds, text and accent colours, tabular numerals.
- **Warnings recorded, not hidden:** `npm ci` prints three non-fatal peer-dependency warnings (eslint 10 vs the ^9 cap in three plugins under `eslint-config-next`). The first build needs network to fetch Inter.
- **Deferred:** Playwright to T009. Light theme was checked by forcing the attribute; no toggle exists until T006.
- **Blockers:** none.

## S01 / T002 — Import the PDF into a clean song list ✅ (2026-11-21)

**Goal met.** `npm run import` turns the SongHub PDF into a deterministic songs file with a report of everything it did and did not read.

- **Result on the supplied PDF:** 384 pages, **47,399 rows**, 0 rejects, 0 duplicate numbers (numbers 1 to 91,718, each exactly once). 1,616 rows were reassembled from wrapped lines. 39 rows have a genuinely blank artist; 458 values end in `...` because the PDF itself truncates them.
- **Method:** word positions from poppler (no new dependency, Node's built-in TypeScript support). Rule and measured thresholds in `DECISIONS.md` (A-005). Output is byte-identical on repeat runs.
- **QA:** `npm run qa` → pass (3 files, 32 tests). Independent cross-check by a different method (`pdftotext -layout`, text only, no geometry): all 47,399 rows agree, 0 disagreements. About 25 wrapped and edge rows read by eye on pages incl. 1, 337 and 384 (the original agent also reviewed pages 1, 2, 7, 62, 100, 150, 192, 250, 300). Error paths (no PDF, non-PDF, missing poppler) fail clearly with no partial output.
- **Gap found and closed:** mutation checks showed nothing tested that the report lists rejects or flags an unbalanced count (the ticket's "never drop silently" requirement). Two tests added; both mutations now fail them.
- **Source quirks for later tickets:** credits mix `ft`, `ft.`, `Feat.`; `¬` damage in six rows; single letters separated by spaces (`A B C`, `U 2`) kept as printed. All recorded in A-005.
- **Not verified:** the cross-check shares poppler's extraction, so a poppler-level error would be invisible; no rendered-image comparison.
- **Blockers:** none.

## S01 / T003 — Artists: normalise, merge variants, split features ✅ (2026-11-21)

**Goal met.** One artist entry per real artist, featured artists credited, and a review report of the decisions left to the client. S01 is complete.

- **Result:** 47,399 songs, **14,482 artists** (from 15,660 printed credits), 267 auto-merged groups (spellings identical once case and punctuation are ignored), 2,083 songs listed under a featured artist as well. Featured split only on ft / ft. / feat / feat. / featuring; `&`, `+`, `,`, `and` and `with` never split. The song keeps its full printed credit.
- **Shipped data:** `public/data/songs.json` + `artists.json`, columnar format (A-006, `src/lib/dataset.ts`), **954,892 B gzipped (~0.91 MB)** against the 1.5 MB budget. Deterministic; `build:data` fails loudly if over budget.
- **QA:** `npm run qa` → pass (85 tests). Round-trip: all 47,399 songs reproduce exactly from the shipped files; every artist count reconciles. All 268 merged groups were inspected by eye; all 2,088 featured credits were audited. 10 mutations caught, plus the 2 gaps QA found, now covered.
- **Fixed after QA:** `B.O.B`/`Bob` and `M.I.A.`/`Mia` had been merged by the dot-dropping rule; the client-controlled `keepSeparate` option now keeps them apart. Marker left in a few cut-off credits, a glued `Horizonft.` credit and a stray bracket were fixed.
- **Open, client decisions (`data/reports/artists-review.md`):** (a) 150 of 960 near-match groups; (b) category names kept as artists (Unknown 568 = 438 printed + 91 printed `..` + 39 blank, Gospel, Ilocano Song, Visayan Song, Children Song, Traditional); (c) 39 `with` credits not split; (d) 428 truncated credits; (e) edge cases; (f) 32 merged-by-rule groups to confirm. `Beatles` and `The Beatles` stay separate by the conservative rule.
- **Notes for later tickets:** artist ids can contain dots (`b.o.b`), so routing and URLs must cope (T008). `Bury It feat. Hayley Williams feat. ...` keeps the second cut-off marker whole.
- **Blockers:** none.

## S02 / T004 — Search engine: normalise, title ranking, artist matching ✅ (2026-11-21)

**Goal met.** A pure-TypeScript engine (`src/lib/search/`, MiniSearch 7.2.0) that finds songs by title, forgives typos, ranks sensibly and suggests artists. No DOM or Node APIs, so it can run in a Web Worker.

- **API:** `buildIndex`, `searchSongs` (best 50, full `total`, `hasMore`), `suggestArtists` (max 3 strong matches, aliases shown canonically), `songsByArtist`.
- **Behaviour:** punctuation, apostrophes, brackets, diacritics and `&`/`and` ignored; AND across words with the last word as a prefix; tiers exact > starts-with > phrase > word-prefix > credit-only > typo. The artist credit is also searched, at lower weight, so `hotel california eagles` works; a title match always outranks a credit-only match.
- **Typo rule (measured on 600 real titles with one typo):** none under 4 letters, 1 edit for 4-5, 2 edits for 6+; recall 364/600 against 337 for the first proposal. Fuzzy only runs when fewer than 5 exact matches exist.
- **Dotted titles:** `Mr.Brightside`-style titles (106) are indexed under both spellings so `mr brightside` works; initialisms like `R.E.M.` stay joined. Shipped data and the normaliser are unchanged.
- **Measured (Node, 47,399 songs):** index build ~385 ms, per-query median 1.5 ms, **p95 ~14 ms** (budget 100 ms), worst ~77 ms. Serialised index 1.17 MB gzipped, larger than the dataset (0.95 MB), so T005 should build in the browser, not ship it prebuilt. Mobile build time (~1-2 s) is an estimate, not a device measurement.
- **QA:** `npm run qa` → pass (145 tests). Independent brute-force oracle over 320 queries: 0 disagreements. 200 typo cases at 6+ letters: 200/200 in the top 50. All 14,482 `songsByArtist` lists match their counts. 40 adversarial inputs: 0 throws, all < 100 ms. 42 mutations, the surviving gaps (fuzzy-gate threshold) now covered by a test.
- **Known limits, documented:** a typo in a 3-letter last word finds nothing until the 4th letter; 4-5 letter transpositions are often missed. Alias suggestions are only tested on synthetic data because the real data has no alias with a distinct normalised form.
- **Blockers:** none.

