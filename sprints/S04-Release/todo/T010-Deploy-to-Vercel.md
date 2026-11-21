# T010 — Deploy to Vercel

**Sprint:** S04-Release
**Size:** S
**Status:** todo
**Assigned agents:** Frontend + QA

## Story
As the owner, I have a public URL for the song book that anyone can open on their phone.

## Acceptance Criteria
- Before any deploy: confirm with the client the Vercel account/team, the project name (`songhub-songbook`) and that the whole song list becoming public is acceptable.
- Static export deployed with the framework preset's static settings; the dataset is compressed and cacheable (long-lived cache with content-hashed names, so a re-import never serves stale data).
- Preview deployment first and checked by the client; production only after approval.
- Production URL checked on a real phone: loads, searches, theme toggle, artist view, back button.
- Deployment details (project, URL, settings) recorded in `DECISIONS.md`.

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
Outward-facing action: deployment happens only after explicit confirmation of the items in the first criterion.

## QA
- [ ] `npm run qa` passes
- [ ] `npm run build` succeeds
- [ ] Acceptance criteria verified against observed behaviour
- [ ] Preview checked by the client
- [ ] Production checked on a real phone

## Blockers
- Client confirmation of account and public visibility
