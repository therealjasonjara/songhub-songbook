# SongHub Songbook

A fast, phone-first lookup for the SongHub karaoke song book. Type a song title (typos are forgiven) to get the song number, or an artist to list all of their songs.

- **Live site:** https://songhub-songbook.vercel.app
- **How it works, in one paragraph:** the song book PDF is read once on your computer and turned into two small data files (`public/data/songs.json` and `public/data/artists.json`). The website is plain static pages plus those two files; there is no server and no database. When the PDF changes, you re-run the import, check two reports, and publish.

Jump to: [Setup](#one-time-setup) | [Update from a new PDF](#updating-the-song-book-from-a-new-pdf) | [Deploy](#deploying) | [Troubleshooting](#when-something-goes-wrong) | [Commit rules](#commit-rules)

---

## One-time setup

Do this once per computer.

### Open a terminal in the project folder

Every command in this guide is typed into a **terminal** (a window where you type commands), in the project folder.

- **macOS:** open the **Terminal** app (press Cmd+Space, type "Terminal").
- **Linux:** open your terminal app (for example "Terminal" or "Konsole").
- **Windows:** use **WSL** (Windows Subsystem for Linux, a Linux terminal inside Windows) and open the project from there.

Then go to the project folder with `cd` ("change directory": it moves the terminal into a folder). For example, if the project is in a folder called `songhub-songbook` inside your home folder:

```
cd ~/songhub-songbook
```

(Use the real location of the folder on your computer.) Check you are in the right place by typing `ls`: you should see `README.md` and `package.json` in the list.

### Install the tools

| Tool | Version | Why | Install |
|---|---|---|---|
| Node.js | **22.23.1** (the file `.nvmrc` says so) | runs everything | Check first: `node -v`. If it already prints `v22.23.1`, skip this. Otherwise use **nvm** (a small tool that installs and switches Node versions; get it from https://github.com/nvm-sh/nvm), then `nvm install` and `nvm use` inside this folder |
| npm | 10 or newer (comes with Node) | installs the packages | nothing extra |
| poppler (`pdftotext`) | any recent | reads the text out of the PDF | Fedora: `sudo dnf install poppler-utils`; Ubuntu/Debian: `sudo apt install poppler-utils`; macOS: `brew install poppler` |
| git | any recent | saves and shares changes | your system's package manager |
| Playwright browser | installed by the command below | the end-to-end tests drive a real browser | `npx playwright install chromium` |
| Vercel CLI | only if you deploy by hand (you normally do not) | manual deploys | `npm install -g vercel` |

Then, in the project folder:

```
nvm use
npm ci
npx playwright install chromium
pdftotext -v
```

(`nvm use` is only needed if you installed nvm; skip it if `node -v` already printed `v22.23.1`.)

**Expected:** `nvm use` says "Now using node v22.23.1". `npm ci` installs the exact package versions this project was tested with and ends with a line like "added N packages" (N is a number). `npx playwright install chromium` downloads a browser (or prints nothing new if it is already there). `pdftotext -v` prints a version line; if it says "command not found", install poppler (table above), then open a new terminal.

---

## Updating the song book from a new PDF

Plain-English summary: replace the PDF, run two commands, read two reports, test, publish. Allow about 20 minutes, most of it reading the reports and the test run.

Words used below: a **branch** is a separate copy of the work: nothing goes live until you merge it. A **pull request** is a page on GitHub where your branch is shown, checked and approved. To **merge** is to accept the change and make it live. The **CDN** is Vercel's network of servers that hands the site to visitors quickly. The **dataset id** is a 16-character code made from the data files' content: the same data always gives the same id, changed data gives a new one.

### Step 1. Start from a clean copy of the project

```
git switch main
git pull
git switch -c update-songbook-YYYY-MM
git status
```

(Use the real year and month in the branch name, for example `update-songbook-2027-03`.)

**Expected:** the last command prints `On branch update-songbook-2027-03` (your branch name) and `nothing to commit, working tree clean`. If it lists changed files, stop and ask your developer.

### Step 2. Put the new PDF in `data/source/`

```
mkdir -p data/source
```

- That command creates the folder if it does not exist yet (a fresh copy of the project does not have it); it does nothing if the folder is there.
- Put **one** PDF in `data/source/`. If an old one is there, delete it first.
- The file name does not matter (the report records it, so a name with a date helps you later).
- This folder is ignored by git on purpose: the PDF is never committed or published.

**Expected:** `ls data/source` shows exactly one `.pdf` file.

### Step 3. Read the PDF: `npm run import`

```
npm run import
```

It takes a couple of seconds. **Expected output** (the numbers are for the current book):

```text
Parsed 47399 rows from 384 pages.
Reassembled from wrapped lines: 1616. Rejected: 0.
Wrote data/work/songs.raw.json and data/reports/import.md
```

It writes `data/work/songs.raw.json` (a scratch file, ignored by git) and `data/reports/import.md`. Open `data/reports/import.md` and check the **Summary** block:

| Line in the report | What it means | What you want |
|---|---|---|
| Rows parsed | Songs found in the PDF | The previous book had **47,399**. More than about 2% away (below 46,450 or above 48,350) means the PDF layout probably changed: **stop** |
| Number anchors detected | Song numbers spotted in the NO. column | Equal to rows parsed plus rejected |
| Rows rejected | Rows the reader could not make sense of | **0**. Anything above 0: **stop** and send the report to your developer |
| `balanced, nothing dropped silently` | Parsed + rejected = detected | The line must say exactly **balanced, nothing dropped silently**. If it says **MISMATCH** or anything else, rows were lost: **stop** |
| Distinct song numbers / Duplicate song numbers | Each number should appear once | Duplicates **0**. Anything above 0: **stop** (the report lists them) |
| Numbers outside 1..99999 | Numbers that look wrong | 0 |
| Rows with empty title / empty artist | Blank cells in the PDF | Title 0. Empty artists: the current book has **39** (under 0.1%). More than about 1% of the rows (about 470 for a book this size) is worth a look: send the report to your developer |
| Wrapped rows | Long titles or artists that ran onto a second line and were joined back | Fine, informational |

The command ends with an error message (and a failure) when rows were dropped or a page could not be read (see the table at the end).

**Stop rule:** stop and send `data/reports/import.md` to your developer if any of these is true: rows parsed is more than 2% away from 47,399; rejected is more than 0; duplicate numbers are more than 0; the balance line is not `balanced, nothing dropped silently`. (When a new book is published, a developer updates 47,399 here to the new count.)

### Step 4. Build the data files: `npm run build:data`

```
npm run build:data
```

**Expected output** (the numbers are for the current book; yours will differ with a new PDF):

```text
Dataset id 4d101923bb85a174.
Songs: 47399. Artists: 14482 (spellings 14787, after auto-merge 14482).
Songs with featured artists: 2083. Near-match groups: 960.
songs.json 2007.2 KB (746.5 KB gz), artists.json 561.6 KB (186.0 KB gz), total 932.6 KB gz
```

This reads the scratch file and writes the three files that matter:

- `public/data/songs.json` and `public/data/artists.json`, what the website loads;
- `data/reports/artists-review.md`, a list of questions about artist names.

The terminal prints the **dataset id**. The same PDF and merge file always give the same id; a changed PDF gives a new one. Two failures to know about:

- If it ends with "Gzipped dataset exceeds the 1.5 MB budget", the data got too big for fast phones: stop and ask your developer (the current data is about 0.93 MB). A failed run can leave half-updated files behind; put the committed ones back with `git restore public/data`, which throws away the uncommitted changes in that folder.
- If it prints `WARNING: data/artist-merges.json was not found`, the merge file is missing or misnamed and none of your decisions were used. See Step 6.

### Step 5. Read the artist report

Open `data/reports/artists-review.md`. The software already merges names that are identical apart from capitals, accents, punctuation, spacing and `&`/`and` (for example `Beyonce` and `Beyoncé`). Everything in the report is **a question for you; nothing in it has changed anything yet.**

| Section | What it shows | Do you need to act? |
|---|---|---|
| Summary | Counts of artists, merged groups, dataset size, and how many of your merge decisions were applied | Skim, but always read the two "applied" lines (Step 6). If a `## Merge file problems` heading appears right after the Summary, your merge file has a typo: fix it |
| **(a)** Near-matches that were NOT merged | Names that look like the same artist (a letter off, a cut-off name) | **Optional.** Add a merge if two entries are really one artist |
| (b) Category-like names | The biggest artists, flagging labels like "Unknown" or "Gospel" | Ignore unless you want one hidden (ask your developer) |
| (c) Credits using "with" | Credits kept whole, not split | Ignore unless one should be split |
| (d) Credits that look truncated | The PDF cuts credits at 39 characters | Ignore: nothing can be recovered |
| (e) Featured markers not split | Credits containing "ft/feat" that could not be split | Ignore |
| **(f)** Merged by rule: please confirm | Groups the software merged but which may be different artists (for example `B.O.B` and `Bob`) | **Look at these.** If two are different people, keep them apart (Step 6) |

With a new PDF, only sections (a) and (f) usually need a decision. Your earlier decisions live in `data/artist-merges.json` and are applied again every time, so a pair you already kept apart does not come back as a merge; section (f) lists it again only with the spellings that still remain together.

**Two "Unknown" numbers that look different but are both right.** The import report says **39** rows have an empty artist. The artist report's Summary says **130** songs have an empty printed artist, listed under "Unknown". They count different things: the import report counts cells that are blank in the PDF (39); the artist report also counts credits printed as just `..` (91 of them), which it treats as empty too: 39 + 91 = 130. (The artist "Unknown" itself has 568 songs, because 438 songs print the word "Unknown".)

### Step 6. Approve merges or keep artists apart (optional)

Edit `data/artist-merges.json` in a plain text editor (not Word). The file is a list: a `[` on the first line, one decision per line, and a `]` on the last line. **Today the whole file is exactly this** (two decisions that keep two pairs of artists apart):

```json
[
  { "keepSeparate": ["B.O.B", "Bob"] },
  { "keepSeparate": ["M.I.A.", "Mia"] }
]
```

**To add a merge** (two spellings that are really one artist), add one line before the closing `]`. Here is the **whole file** after adding one; **line 4 is the new one** (the lines 1 to 3 and 5 were already there, apart from the comma at the end of line 3):

```json
[
  { "keepSeparate": ["B.O.B", "Bob"] },
  { "keepSeparate": ["M.I.A.", "Mia"] },
  { "names": ["April Boy_jc Regino"], "into": "April Boy Regino" }
]
```

**Never replace the file with a single example.** Pasting one example over the file silently deletes your earlier decisions (the B.O.B and M.I.A. lines above would be lost, and nothing would warn you). **Add one line inside the existing brackets, with a comma after every line except the last.** A missing comma is the usual mistake.

- `names` lists the spellings to fold in (use the exact names printed in the report); `into` is the name people will see. You can add `"ids": ["some-artist-id"]` as well (ids are in `public/data/artists.json`), but names are easier.
- To **keep two spellings apart** (the software merged them, you say they are different artists), section (f) prints the `{ "keepSeparate": [...] }` line ready to copy: add it as one more line the same way.

After editing, run `npm run build:data` again and re-read the report. **Check that your decisions were used.** In `data/reports/artists-review.md`, the Summary must say how many were applied. Today it reads:

- `Artists after approved merges (data/artist-merges.json, 0 rule(s) applied)`: this counts your merge lines (the `names`/`ids` ones). It is 0 today because there are none yet; after adding one it must say 1.
- `keepSeparate groups applied: 2`: this counts your keep-apart lines. It must say **2** (or higher if you added more). If it says 0, your earlier decisions were lost: restore the file with `git restore data/artist-merges.json` and add your line again.

Three things that go wrong, and how they look:

| What happens | What you see |
|---|---|
| A missing comma or bracket | `build:data` stops with one line: `data/artist-merges.json is not valid JSON near position N` (N is how many characters from the start of the file the mistake is near, and the text in brackets says what it expected, for example `Expected ',' or ']'`). Nothing is written. Add the missing comma or bracket near that spot and run it again |
| A name that matches nobody | `build:data` finishes, prints `1 problem(s) in data/artist-merges.json`, and the report gets a `## Merge file problems` section (it appears only when there is a problem) naming the line. Fix the spelling |
| The file is missing or misnamed (for example a name missing its final `s`) | `build:data` finishes but prints `WARNING: data/artist-merges.json was not found`, and the Summary has a **WARNING** line. None of your decisions were used and the dataset id is different. Fix the name and run it again |

### Step 7. Look at the result on your computer

```
npm run build
node scripts/serve-out.mjs 4173 out
```

**Expected:** the build ends with a list of pages (`/` and others) and no error; the second command prints that it is serving, and keeps running. Open http://127.0.0.1:4173 in your browser. (Press Ctrl+C in the terminal to stop it.) The faster-but-rougher alternative is `npm run dev`, which serves http://localhost:3000.

Try:

1. A title with a typo (for example `hotel californa`): the right song should appear with its number.
2. An artist (for example `eagl`): tap the artist, check the song list opens and Back returns to the search.
3. The count: open an artist and check the number of songs looks sensible against the PDF.
4. A brand-new song from the new PDF: its number should be found.

### Step 8. Run the full checks: `npm run qa:full`

```
npm run qa:full
```

What it runs, in order: the type check, the code style check, about 340 unit tests (including tests that parse the real PDF output), a production build, then about 175 browser tests (search, artists, phone layout, accessibility, colours, page speed). Expect **about 5 minutes** on a quiet machine (measured 4 minutes). **Expected:** the last lines show all tests passed (for example `174 passed`) and the command finishes without an error.

**Do not commit before `qa:full` is green.**

**Use a quiet machine.** The page-speed tests deliberately slow the CPU down and measure; if you are video-calling or compiling something else, they can fail for no real reason. If **only a performance test** fails (the failing name mentions speed, keystroke or load time), close other programs and run `npm run qa:full` once more. If the same one fails again on a quiet machine, or any other test fails, stop and tell your developer.

---

## Deploying

The site is hosted on Vercel, connected to the GitHub repository. Publishing is: put the change on `main`, and Vercel rebuilds and replaces the live site by itself (about a minute).

### What to commit

Only these files should be in your change:

| Path | What it is |
|---|---|
| `public/data/songs.json` | the songs |
| `public/data/artists.json` | the artists |
| `data/reports/import.md` | the import report (record of this PDF) |
| `data/reports/artists-review.md` | the artist review |
| `data/artist-merges.json` | your merge decisions (only if you changed it) |

**Not** the PDF (`data/source/` is ignored) and not `data/work/`. Check with `git status`: anything else listed is a mistake or needs a developer.

### Steps

```
git status
git add public/data/songs.json public/data/artists.json data/reports/import.md data/reports/artists-review.md data/artist-merges.json
git commit -m "Update song book data from the new PDF"
git push -u origin HEAD
```

**Do NOT use `git add .` or `git add -A`:** they add everything, including files that must not be committed. Name the five paths as shown.

`git push -u origin HEAD` uploads your branch to GitHub and remembers it. It **publishes nothing yet**: the live site only changes when you merge in the next part. **Expected:** the push ends with a line naming your branch and a link to open a pull request.

Then:

1. Open the pull request on GitHub (use the link the push printed, or "Compare & pull request" on the repository page). Vercel adds a **preview** link to the pull request. Previews are behind the Vercel login, so only you (signed in) can open them. Use it for a last look if you want.
2. Merge the pull request into `main` (the green button). **That is the production release**: Vercel rebuilds and replaces https://songhub-songbook.vercel.app.
3. After about a minute, check the live site:

```
LIVE_URL=https://songhub-songbook.vercel.app npm run test:live
```

This runs the same browser tests against the real site (about 10 minutes; a couple of tests are skipped by design). **Expected:** it ends with a "passed" count and no failures (a couple "skipped" is normal). Also search one or two songs by hand on your phone.

### Who can open the site

The intended setup (decision A-016): the **live site is public** (anyone with the link opens it, no login), and **preview links stay behind the Vercel login**. A check anyone can do: open https://songhub-songbook.vercel.app in a private/incognito window (one where you are not signed in to anything). It must open the song book **without asking for a login**. A preview link (from a pull request), opened the same way, must ask for a Vercel login. If the live site asks for a login, production is wrongly locked: see the table at the end.

### Rolling back

If the live site is wrong after a release, you have two options:

- **Fastest (about 1 minute):** in the Vercel dashboard open the project `songhub-songbook`, go to **Deployments**, find the previous good one, open its menu and choose **Instant Rollback**. (After a rollback Vercel stops auto-publishing new merges until you promote a deployment again, so finish with the second option.)
- **Permanent:** on GitHub open the merged pull request and press **Revert**, then merge the revert pull request. Production rebuilds from `main` with the old data.

### What a visitor sees during a release

The two data files are downloaded separately and each carries the same dataset id. If a visitor's phone ends up with one old file and one new file (it can happen for a moment while the CDN switches over), the page refuses the mismatched pair instead of showing wrong songs: it shows **"Couldn't load the song book. Check your connection and try again."** with a **Try again** button. Pressing it fetches fresh copies and works. Nothing needs doing on your side.

---

## When something goes wrong

| What you see | Likely cause | What to do |
|---|---|---|
| `pdftotext` "command not found" / the import says poppler is missing | poppler is not installed | Install it (setup table), open a new terminal, run `pdftotext -v`, then `npm run import` again |
| "No PDF found. Put the song book PDF in data/source/" | folder empty or missing (it does not exist in a fresh copy of the project) | `mkdir -p data/source`, then copy the PDF into it |
| "Expected exactly one PDF in data/source/, found 2" | old and new PDF both there | Delete the old one so one PDF remains |
| "Import failed: pdftotext failed (exit 1): ... Syntax Error" | the file is not a real PDF (damaged, or renamed from something else), or is password-protected | Open the file in a PDF viewer to check it; get a fresh copy of the PDF |
| The import ends with "Row accounting does not balance" or the report says **MISMATCH** | the PDF layout is different from the one the reader was built for | **Stop.** Do not build or publish. Send `data/reports/import.md` and the PDF to your developer |
| "At least one page could not be parsed at all" | a page has a layout the reader cannot read | Same: stop and send the report |
| `npm run build:data` says "data/work/songs.raw.json not found" | you skipped Step 3 | Run `npm run import` first |
| `build:data` says "Gzipped dataset exceeds the 1.5 MB budget" | the data got too big for the speed target | Stop and ask your developer. The failed run already wrote the data files, so put the committed ones back: `git restore public/data` (it discards the uncommitted changes in that folder) and do not publish them |
| "problem(s) in data/artist-merges.json" | a name in your file does not match any artist | Open the `## Merge file problems` section of the artist report (it exists only when there are problems); fix the name |
| `data/artist-merges.json is not valid JSON near position N` (an older version shows a long `SyntaxError ... position N` message instead) | a missing comma or bracket near character N of the file | Add the missing comma (between entries) or bracket (the outer `[` `]`) near that spot, run `build:data` again |
| `data/artist-merges.json must be a JSON list` | the file is not a list | The file must start with `[` and end with `]` (Step 6) |
| `WARNING: data/artist-merges.json was not found` | the file is missing or misnamed | Put it back with `git restore data/artist-merges.json`, or fix the name; run `build:data` again |
| `qa:full` fails on a speed test only | the computer was busy | Quiet machine, run once more (Step 8) |
| `qa:full` fails on anything else | a real problem | Stop; do not merge. Send the first failing test name and its message to your developer |
| "out/index.html is missing" when running tests | you did not build | `npm run build`, then run the tests again |
| Playwright says the browser is not installed | one-time setup skipped | `npx playwright install chromium` |
| "Unsupported engine" or Node version warning | wrong Node | `nvm use` (the project needs 22.x) |
| Vercel build fails with a Node.js version error | the Vercel project must use Node **22.x** (Vercel's default for new projects is newer and this project's pinned `engines` field rejects it) | Vercel dashboard, project Settings, General, Node.js Version: choose **22.x**, then redeploy |
| A preview link asks you to log in to Vercel | previews are behind the Vercel login on purpose; production is public (decision A-016) | Sign in to Vercel; the public site is not affected |
| The **live** site asks for a Vercel login (it fails the incognito check above) | production is wrongly protected: it must be public, with only previews behind the login | In the Vercel project settings, Deployment Protection (Vercel Authentication), make the protection cover **preview deployments only**, not production; then repeat the incognito check. If unsure, ask your developer |
| You create a brand-new Vercel project and "it went live" | the **first deployment of a new project is production**, even without asking | Set protection before the first deploy and treat it as a release (only matters for a new project) |

---

## Where decisions are recorded

| Document | What is in it |
|---|---|
| `PRD.md` | What the product must do, the data model, the business rules and the performance budgets |
| `DECISIONS.md` | Every technical choice and why (stack, import format, search, deployment, hiding from search engines). Entries are numbered A-001 and up; the import and data format are A-005 and A-006, deployment is A-016, this runbook is A-017 |
| `STORYBOARD.md` | The plain-language description of the screens and flows |
| `sprints/S0N-*/{todo,ongoing,done}/` | One file per piece of work (ticket). A ticket moves from `todo` to `ongoing` to `done` as it is built and checked |
| `docs/DEVICE-CHECKLIST.md` | A short list to run on a real phone after a big change |
| `PROGRESS.md` | Where the project stands |

---

## Costs and plan

The site runs on Vercel's **Hobby** plan, which is for personal, non-commercial use. If the song book is used commercially (by a venue, or by SongHub as a business), Vercel may require the paid **Pro** plan. Check Vercel's current terms and decide before relying on it commercially.

---

## For developers

```
nvm use          # Node 22.23.1
npm ci
npm run dev      # http://localhost:3000
npm run qa       # typecheck, lint, unit tests (the quick gate)
npm run build    # static export to out/
npm run qa:full  # qa, then build, then the Playwright end-to-end suite (the full gate)
```

### End-to-end tests

The suite in `tests/e2e/` runs Playwright (Chromium only) against the built site in `out/`, served by `scripts/serve-out.mjs` on port 4173 (started by `playwright.config.ts`). It needs a build first; `npm run qa:full` does that.

```
npx playwright install chromium   # once on a fresh machine or CI runner (the browser is not in node_modules)
npm run build
npm run test:e2e                  # the whole suite; `npm run e2e` is the same
npx playwright test search        # one area (file name), e.g. search, artists, accessibility, seo
npx playwright show-trace test-results/<test>/trace.zip   # a trace is kept for each failed test
```

Two projects: `mobile` (390x844, the default) and `desktop` (1280x800, the layout specs only). Areas: search, artists and history, theme and URL, loading and error, layout spec table, responsive widths, large text, accessibility (axe-core, keyboard, screen-reader names), contrast and tap targets, SEO, performance.

Throttled-mobile performance numbers (not part of `qa:full`; about 5 minutes): `npm run measure:perf` runs Wi-Fi and Slow 4G at 4x and 6x CPU slowdown, three cold-cache runs each, and prints a table. `npm run measure:browser` is the older load-path measurement (A-008). Real phones: see `docs/DEVICE-CHECKLIST.md`.

The commands and paths in this README are checked by `tests/unit/readme-commands.test.ts`, which runs in `npm run qa`: renaming a script or file without updating the README fails the gate.

## Commit rules

This repository ships as the client's own work. No commit message, pull request, issue comment, tag, release note, code comment or document may carry AI attribution: no AI co-author trailer, no "generated with" footer, no assistant or model names.

## Search visibility

The site is public but hidden from search engines (DECISIONS.md, A-015): `noindex, nofollow` in the page head and in an `X-Robots-Tag` header (`vercel.json`), and `public/robots.txt` allows crawling on purpose (`Disallow: /` would stop Slack and some other apps from building a link preview). This is hiding, not protection: anyone with the link can use the site and fetch `/data/*.json`. To make it indexable, remove the noindex in those two places (listed in A-015).
