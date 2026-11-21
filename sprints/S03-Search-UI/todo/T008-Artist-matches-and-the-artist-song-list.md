# T008 — Artist matches and the artist song list

**Sprint:** S03-Search-UI
**Size:** M
**Status:** todo
**Assigned agents:** Design + Frontend + QA

## Story
As a guest, I type an artist, tap them, and see every song by that artist.

## Acceptance Criteria
- `ARTISTS` section above songs with up to 3 strongly matching artists: 64px rows with name, `N songs` and a chevron; `ARTISTS` and `SONGS` labels per the spec; section labels appear only when artists are shown.
- Tapping an artist opens the artist view: pinned search box keeps its text, heading block 80px with a 44x44 back chevron, name 24/30 (2 lines max) and `N songs` (count includes features).
- The artist's full list is A–Z by title, uncapped, and windowed for performance; rows are the same song row as T007 including featured credits.
- Back chevron and the browser back button return to the previous results; editing the search box leaves the artist view.
- The artist view is addressable by URL (`?q=…&artist=<id>`).
- Spelling variants appear once (merged in T003). A prolific artist's list scrolls smoothly with no dropped frames on the throttled profile.
- Song numbers use Inter, accent colour (not monospace, not white); focus border is accent (not blue).

## Design Reference
- **Source (D-000):** Stitch
- **Reference:** Layout references `78fdcd40…` (artist matches) and `5dc2575d…` (artist list) — deviations listed in `DECISIONS.md` must not be copied; the spec text governs
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
These two screens are layout references only, so the Frontend Agent must build from the spec text. Show the client the built result at the ticket's end.

## QA
- [ ] `npm run qa` passes
- [ ] `npm run build` succeeds
- [ ] `npm run qa:full` (UI tickets)
- [ ] Acceptance criteria verified against observed behaviour
- [ ] Visual check at 390px, dark and light, recorded in PROGRESS

## Blockers
- None
