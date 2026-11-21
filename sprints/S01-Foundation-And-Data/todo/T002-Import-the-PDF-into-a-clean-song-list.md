# T002 — Import the PDF into a clean song list

**Sprint:** S01-Foundation-And-Data
**Size:** M
**Status:** todo
**Assigned agents:** Backend + QA

## Story
As the owner, I can run one command on the SongHub PDF and get every song's number, title and artist, with a report of anything that could not be read.

## Acceptance Criteria
- `npm run import` reads `data/source/*.pdf` and writes the songs dataset (`n`, `t`, `a`) plus `data/reports/import.md`.
- Parsing uses word positions (e.g. poppler's bbox output), not plain line text: the PDF is two columns per page and long titles or artist names wrap onto a second line, which can separate a number from its title.
- Expected volume: about 47,400 rows over 384 pages; the report states the exact count parsed and the page-level breakdown.
- Wrapped rows are reassembled when the join is unambiguous; any row that is not is listed in the report with page, column and the raw text, never dropped silently.
- Duplicate song numbers are reported, not overwritten. Numbers are validated as integers (observed max 5 digits).
- Unit tests with fixtures cover: a normal row, a wrapped title, a wrapped artist, a number on its own line, a title starting with punctuation or a digit, and both columns of a page.
- The source PDF is gitignored. The importer needs `pdftotext`/poppler on the machine and says so clearly if missing.

## Design Reference
- **Source (D-000):** n/a — non-UI ticket
- **Reference:** n/a
- **Approved:** n/a

## Data / Schema Impact
- **Entities touched:** Song (number, title, artist credit)
- **Schema change:** no (new)
- **New fields:** `n:int`, `t:string`, `a:string` required
- **Migration:** n/a

> A data change also updates the Entities section of `PRD.md` in this same ticket.

## API Impact
- **Endpoints added/changed:** none
- **Breaking for existing consumers:** no

## Technical Notes
Spot-check a sample of pages against the PDF by eye before closing the ticket and record which pages in PROGRESS.

## QA
- [ ] `npm run qa` passes
- [ ] `npm run build` succeeds
- [ ] Acceptance criteria verified against observed behaviour
- [ ] Row count matches the PDF within the reported, explained rejects
- [ ] A hand-checked sample of at least 5 pages matches the output exactly

## Blockers
- None
