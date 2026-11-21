# T005 — Load the dataset and keep typing fast

**Sprint:** S02-Search-Engine
**Size:** M
**Status:** todo
**Assigned agents:** Frontend + QA

## Story
As a guest on a phone, I can start typing right away and the results never stutter, even on a slow connection.

## Acceptance Criteria
- The dataset loads once from `public/data/` (compressed by the host) and the index is built inside a Web Worker so the main thread never blocks.
- A loading state shows only if the dataset is not ready when the user searches; typing is never blocked.
- Measured on a throttled mid-range mobile profile: first results within 2 s of load and each keystroke within 100 ms. If index build time breaks the budget, switch to a pre-built serialised index and record the numbers and the decision as A-006.
- Dataset transfer stays under 1.5 MB gzipped.
- A failed dataset load shows a clear retry message instead of a blank screen.

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
This ticket is where the 'build index at runtime vs ship it prebuilt' decision gets made with real numbers. Do not guess.

## QA
- [ ] `npm run qa` passes
- [ ] `npm run build` succeeds
- [ ] Acceptance criteria verified against observed behaviour

## Blockers
- None
