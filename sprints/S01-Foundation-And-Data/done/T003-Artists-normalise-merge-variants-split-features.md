# T003 — Artists: normalise, merge variants, split features

**Sprint:** S01-Foundation-And-Data
**Size:** M
**Status:** done
**Assigned agents:** Backend + QA

## Story
As the owner, I get one artist entry per real artist, with featured artists credited, and a short report of near-matches I should decide on.

## Acceptance Criteria
- Builds the Artist list from each song's credit using business rules 1, 5 and 6 of the PRD.
- Variants identical after normalisation are merged into one artist with a canonical display name (most frequent spelling) and the others kept as `aliases`.
- Credits are split only on `ft.`, `feat.`, `featuring`. `&`, `+`, `and` and `,` are never split. A song is listed under every featured artist while keeping its full printed credit.
- `data/reports/artists-review.md` lists near-matches that were NOT merged (e.g. likely typos like `April Boy_jc Regino` vs `April Boy Regino`), grouped, with song counts, for the client to approve. An optional `data/artist-merges.json` approved-merges file is applied on the next run.
- Outputs `public/data/` files: songs (`n`,`t`,`a`,`ar`) and artists (`id`,`name`,`aliases`,`count`). Artist ids are stable across re-imports.
- Unit tests: variant merge, `&` not split, `ft.` split with both artists listed, alias preservation, stable ids, approved-merges file applied.
- Gzipped dataset is under the 1.5 MB budget; the report states the actual size.

## Design Reference
- **Source (D-000):** n/a — non-UI ticket
- **Reference:** n/a
- **Approved:** n/a

## Data / Schema Impact
- **Entities touched:** Artist (id, name, aliases, count); Song.ar
- **Schema change:** no (new)
- **New fields:** see PRD Data Model
- **Migration:** n/a

> A data change also updates the Entities section of `PRD.md` in this same ticket.

## API Impact
- **Endpoints added/changed:** none
- **Breaking for existing consumers:** no

## Technical Notes
The review report goes to the client before the merge list is considered final (client decision). Aggressive fuzzy auto-merging is explicitly not done (A-002).

## QA
- [x] `npm run qa` passes
- [x] `npm run build` succeeds
- [x] Acceptance criteria verified against observed behaviour
- [x] Client has reviewed `artists-review.md` — OPEN, does not block later tickets: merges are re-runnable via `data/artist-merges.json` (approved merges and `keepSeparate`)

## Blockers
- None
