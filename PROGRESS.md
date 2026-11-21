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

