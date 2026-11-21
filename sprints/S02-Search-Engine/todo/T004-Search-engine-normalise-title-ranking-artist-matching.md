# T004 — Search engine: normalise, title ranking, artist matching

**Sprint:** S02-Search-Engine
**Size:** M
**Status:** todo
**Assigned agents:** Frontend + QA

## Story
As a guest, I get the right songs when I type part of a title, even with a typo, and the right artists when I type a name.

## Acceptance Criteria
- Pure TypeScript module in `lib/search/` with no UI: `normalize`, `buildIndex`, `searchSongs(query)`, `suggestArtists(query)`, `songsByArtist(id)`.
- Business rules 1–4 of the PRD hold: apostrophes, brackets and punctuation ignored; matches anywhere in the title; exact > prefix > fuzzy; best 50 returned with a flag saying more matched; up to 3 strongly matching artists.
- Typo tolerance verified with cases such as `hotel californa` → *Hotel California* and `di ka na others` → *'Di Ka Na Others*.
- Tests run against a realistic fixture drawn from the real dataset (several thousand songs) and assert ranking order, not just presence.
- Measured on the full dataset in Node: index build time and per-query time recorded in the ticket; per-query under 100 ms.
- Artist suggestions do not appear for weak matches (e.g. a word that appears only mid-name).

## Design Reference
- **Source (D-000):** n/a — non-UI ticket
- **Reference:** n/a
- **Approved:** n/a

## Data / Schema Impact
- **Entities touched:** none (reads the shipped dataset)
- **Schema change:** no
- **New fields:** none
- **Migration:** n/a

> A data change also updates the Entities section of `PRD.md` in this same ticket.

## API Impact
- **Endpoints added/changed:** none
- **Breaking for existing consumers:** no

## Technical Notes
Use MiniSearch's prefix and fuzzy options; tune fuzziness on real data, and write the chosen values down as A-005 in `DECISIONS.md`.

## QA
- [ ] `npm run qa` passes
- [ ] `npm run build` succeeds
- [ ] Acceptance criteria verified against observed behaviour

## Blockers
- None
