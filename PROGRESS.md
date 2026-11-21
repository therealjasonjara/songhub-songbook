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
