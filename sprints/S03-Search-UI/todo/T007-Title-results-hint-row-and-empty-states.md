# T007 — Title results, hint row and empty states

**Sprint:** S03-Search-UI
**Size:** M
**Status:** todo
**Assigned agents:** Design + Frontend + QA

## Story
As a guest, I type a title and see song numbers, large and readable, appearing as I type.

## Acceptance Criteria
- Song row exactly per the spec: fixed 88px, number column 136px with the number at 36/40, weight 800, accent colour, tabular; title 17/22 (max 2 lines); artist 14/20 (1 line); full printed credit for features; hairline divider; pressed state; tapping does nothing.
- Results come from the T004 engine through the T005 worker; best 50 shown, with the 64px hint row `Showing the top 50 matches. Keep typing to narrow down.` when more matched.
- `No songs found` state per the spec with the typed text echoed (ellipsis if long).
- A 5-digit number never clips or wraps in the number column on a 320px-wide phone.
- Component tests for the row (long title, long artist, featured credit, 5-digit number) and for the empty and hint states.

## Design Reference
- **Source (D-000):** Stitch
- **Reference:** Screen `dba15038…` (title results, approved), `bf810fe1…` (light, approved); `81a9b231…` is a layout reference only (do not copy its avatar, back arrow or small clear button)
- **Approved:** yes (direction and spec, 2026-11-21)

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
Fixed row height keeps the list simple; no windowing is needed for 50 rows.

## QA
- [ ] `npm run qa` passes
- [ ] `npm run build` succeeds
- [ ] `npm run qa:full` (UI tickets)
- [ ] Acceptance criteria verified against observed behaviour

## Blockers
- None
