# T009 — Accessibility, performance and end-to-end checks

**Sprint:** S03-Search-UI
**Size:** M
**Status:** todo
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
Use real-device or throttled-emulation numbers for performance, and say which.

## QA
- [ ] `npm run qa` passes
- [ ] `npm run build` succeeds
- [ ] `npm run qa:full` (UI tickets)
- [ ] Acceptance criteria verified against observed behaviour
- [ ] Playwright suite passes in CI-style run
- [ ] Performance numbers recorded

## Blockers
- None
