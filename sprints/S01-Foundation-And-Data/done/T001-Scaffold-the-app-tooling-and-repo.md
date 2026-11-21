# T001 — Scaffold the app, tooling and repo

**Sprint:** S01-Foundation-And-Data
**Size:** S
**Status:** done
**Assigned agents:** Frontend + QA (no Backend — client-side only)

## Story
As the project owner, I have a Next.js static-export app with tests, lint and a one-command QA gate, so every later ticket starts from a green baseline.

## Acceptance Criteria
- Next.js 16 app router with `output: 'export'`, TypeScript strict, Tailwind CSS 4, using the versions in `DECISIONS.md`. Confirm TypeScript 7 works with Next.js 16.4 first; if not, pin the newest supported version and record why.
- Scripts per the workflow: `typecheck`, `lint`, `test` (Vitest), `qa`, `build`. `npm run qa` exits zero on the scaffold.
- Inter loaded through the framework's font mechanism (self-hosted, no runtime request to a font CDN), with tabular numerals enabled.
- Design tokens from `docs/SHARED_COMPONENTS.md` (both themes) defined once as CSS variables; no Stitch token values.
- Git repo initialised with a `.gitignore` (node_modules, .next, out, `data/source/`, `.vercel`, env files); attribution rules from the workflow apply to every commit (see the rules in `CONTRIBUTING`-style note in README).
- A placeholder home page builds to a static `out/` folder with zero server code.

## Design Reference
- **Source (D-000):** n/a — non-UI ticket
- **Reference:** n/a
- **Approved:** n/a

## Data / Schema Impact
- **Entities touched:** none
- **Schema change:** no
- **New fields:** none
- **Migration:** n/a

> A data change also updates the Entities section of `PRD.md` in this same ticket.

## API Impact
- **Endpoints added/changed:** none
- **Breaking for existing consumers:** no

## Technical Notes
Playwright is added in T010 (the first ticket with a real UI flow to test). Record the final scaffold layout as A-004 in `DECISIONS.md`.

## QA
- [x] `npm run qa` passes
- [x] `npm run build` succeeds
- [x] Acceptance criteria verified against observed behaviour

## Blockers
- None
