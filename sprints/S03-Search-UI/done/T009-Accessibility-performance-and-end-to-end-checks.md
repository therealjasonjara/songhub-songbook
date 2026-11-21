# T009 — Accessibility, performance and end-to-end checks

**Sprint:** S03-Search-UI
**Size:** M
**Status:** done
**Assigned agents:** Frontend + SEO + QA

## Story
As a guest in a dim, noisy venue on a basic phone, the app is readable, fast and usable with one hand.

## Acceptance Criteria
- Playwright E2E added (Chromium): search by title with a typo, search by artist and open the list, back button behaviour, theme toggle, empty state, reload with `?q=`.
- Contrast verified on the rendered pages against the spec's table, both themes; all tap targets at least 44px.
- Keyboard and screen-reader pass: labelled search input, results announced politely, visible focus ring.
- Throttled-mobile run confirms the performance budget in the PRD; numbers recorded.
- SEO basics for a single public page: title, description, Open Graph/Twitter card, theme-color, favicon, `robots.txt`; no analytics.
- `npm run qa:full` is the gate and exits zero.

## Design Reference
- **Source (D-000):** n/a
- **Reference:** Verification of tickets 6–8
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
Use real-device or throttled-emulation numbers for performance, and say which. Emulation numbers (throttled desktop Chromium, CDP) are recorded in DECISIONS A-014 and reproduced with `npm run measure:perf`; real-device checks are listed in `docs/DEVICE-CHECKLIST.md` for the client to run. The e2e suite needs a build and, on a fresh machine, `npx playwright install chromium` (README).

## QA
- [x] `npm run qa` passes
- [x] `npm run build` succeeds
- [x] `npm run qa:full` (UI tickets)
- [x] Acceptance criteria verified against observed behaviour — verified in real Chromium with throttling; NOT on a real phone (see docs/DEVICE-CHECKLIST.md; open)
- [x] Playwright suite passes in CI-style run
- [x] Performance numbers recorded

## Blockers
- Icon defect (fixed): the first favicon, apple-touch icon and social card drew one note head instead of the header icon's two. All three now match `MusicNoteIcon` exactly and were regenerated; a unit test compares every shape against the header icon.
- Loose performance gate (tightened): keystroke p95 is now under 100 ms (the PRD budget) and the median under 70 ms, first results are also held to 3x the recorded baseline, and a test checks the data preload in the built HTML. Mutation-checked.
- Font licence (added): `scripts/brand/OFL.txt` (SIL Open Font License 1.1, Inter copyright) sits next to `Inter-latin.woff2`; see A-013.
- Pending client approval: the favicon, apple-touch icon and social card visuals (and the new tagline copy) are not in the approved design.
