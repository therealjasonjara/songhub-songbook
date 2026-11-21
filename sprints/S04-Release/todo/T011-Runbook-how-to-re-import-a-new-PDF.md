# T011 — Runbook: how to re-import a new PDF

**Sprint:** S04-Release
**Size:** S
**Status:** todo
**Assigned agents:** Backend + QA

## Story
As the owner, I can update the song book from a new SongHub PDF without developer help beyond running a few commands.

## Acceptance Criteria
- `README.md` explains: install, where to put the PDF, `npm run import`, how to read the two reports, how to approve artist merges, how to run QA, and how to deploy.
- A dry run with the same PDF produces an identical dataset (stable ids, deterministic output).
- The README states the attribution rule for commits made in this repo, neutrally (no AI attribution in any commit, PR or doc).
- A clean clone can follow the README end to end.

## Design Reference
- **Source (D-000):** n/a
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
None.

## QA
- [ ] `npm run qa` passes
- [ ] `npm run build` succeeds
- [ ] Acceptance criteria verified against observed behaviour

## Blockers
- None
