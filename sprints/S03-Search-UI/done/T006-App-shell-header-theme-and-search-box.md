# T006 — App shell: header, theme and search box

**Sprint:** S03-Search-UI
**Size:** M
**Status:** done
**Assigned agents:** Design + Frontend + QA

## Story
As a guest, I see the SongHub header and a big search box that is ready to type in the moment the page opens.

## Acceptance Criteria
- Header exactly per the spec: 56px, accent music note, `SongHub` (800) + ` Songbook` (400), and a 44x44 sun/moon toggle. Nothing else — no avatar, no back arrow, no menu.
- Search input per the spec: sticky, 56px tall, 16px radius, magnifier muted, clear button 48x48 appearing only with text, placeholder `Search song or artist`, autofocus, `inputmode=search`.
- Dark theme by default; the toggle switches to light for the session with every token from the spec; contrast ratios meet the spec's table.
- Pre-typing home state per the spec: music note, `Find your song number`, `Type a song title or an artist.`, `About 47,000 songs`.
- Query lives in the URL (`?q=`) so reload and back work.
- Matches the approved references: screens 2 and 6 for look; spec text for everything else. Do not copy the known deviations listed in `DECISIONS.md`.

## Design Reference
- **Source (D-000):** Stitch
- **Reference:** Spec `docs/SHARED_COMPONENTS.md`; approved screens `dba15038…` (dark) and `bf810fe1…` (light); layout reference `0807d60c…` (do not copy its avatar button)
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
Check the build visually at 390px wide in both themes, not only by tests.

## QA
- [x] `npm run qa` passes
- [x] `npm run build` succeeds
- [x] `npm run qa:full` (UI tickets)
- [x] Acceptance criteria verified against observed behaviour
- [x] Visual check at 390px in dark and light recorded in PROGRESS

## Blockers
- None
