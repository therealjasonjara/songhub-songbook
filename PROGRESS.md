# PROGRESS — SongHub Songbook

**Project:** songhub-songbook

Phase 1 (Intake), Phase 2 (Storyboard) and Phase 2.5 (Design) complete. Phase 3 (PRD and tickets) written 2026-11-21 and awaiting approval. No code before approval.

Plan: 4 sprints, 11 tickets. See `sprints/`.

| Sprint | Tickets |
|--------|---------|
| S01 Foundation and Data | T001 scaffold · T002 PDF import · T003 artists |
| S02 Search Engine | T004 engine · T005 loading and speed |
| S03 Search UI | T006 shell · T007 title results · T008 artists · T009 a11y, perf, E2E |
| S04 Release | T010 Vercel deploy · T011 runbook |

<!-- One block per ticket is added here as it is completed (Phase 5). -->

## S01 / T001 — Scaffold the app, tooling and repo ✅ (2026-11-21)

**Goal met.** A static-export Next.js app with a one-command QA gate and the design tokens in place.

- **Stack installed:** Next.js 16.4.6, React 19.3.1, TypeScript **6.0.3** (not 7: typescript-eslint peers `typescript <6.1.0`), Tailwind 4.3.5, Vitest 5.1.1, ESLint 10.15.0. Exact pins and the reasons are in `DECISIONS.md` (A-004).
- **QA:** `npm run qa` and `npm run build` exit 0; deliberate type, lint and test failures each fail their command. Static `out/`: no server code, no external URLs, Inter self-hosted (0 external requests in headless Chromium).
- **Tokens:** all 11 spec tokens match `docs/SHARED_COMPONENTS.md` hex-for-hex in both themes (checked by script); Stitch's drifted values are absent.
- **Rendered check:** 390px headless render, dark and light: correct backgrounds, text and accent colours, tabular numerals.
- **Warnings recorded, not hidden:** `npm ci` prints three non-fatal peer-dependency warnings (eslint 10 vs the ^9 cap in three plugins under `eslint-config-next`). The first build needs network to fetch Inter.
- **Deferred:** Playwright to T009. Light theme was checked by forcing the attribute; no toggle exists until T006.
- **Blockers:** none.

## S01 / T002 — Import the PDF into a clean song list ✅ (2026-11-21)

**Goal met.** `npm run import` turns the SongHub PDF into a deterministic songs file with a report of everything it did and did not read.

- **Result on the supplied PDF:** 384 pages, **47,399 rows**, 0 rejects, 0 duplicate numbers (numbers 1 to 91,718, each exactly once). 1,616 rows were reassembled from wrapped lines. 39 rows have a genuinely blank artist; 458 values end in `...` because the PDF itself truncates them.
- **Method:** word positions from poppler (no new dependency, Node's built-in TypeScript support). Rule and measured thresholds in `DECISIONS.md` (A-005). Output is byte-identical on repeat runs.
- **QA:** `npm run qa` → pass (3 files, 32 tests). Independent cross-check by a different method (`pdftotext -layout`, text only, no geometry): all 47,399 rows agree, 0 disagreements. About 25 wrapped and edge rows read by eye on pages incl. 1, 337 and 384 (the original agent also reviewed pages 1, 2, 7, 62, 100, 150, 192, 250, 300). Error paths (no PDF, non-PDF, missing poppler) fail clearly with no partial output.
- **Gap found and closed:** mutation checks showed nothing tested that the report lists rejects or flags an unbalanced count (the ticket's "never drop silently" requirement). Two tests added; both mutations now fail them.
- **Source quirks for later tickets:** credits mix `ft`, `ft.`, `Feat.`; `¬` damage in six rows; single letters separated by spaces (`A B C`, `U 2`) kept as printed. All recorded in A-005.
- **Not verified:** the cross-check shares poppler's extraction, so a poppler-level error would be invisible; no rendered-image comparison.
- **Blockers:** none.

## S01 / T003 — Artists: normalise, merge variants, split features ✅ (2026-11-21)

**Goal met.** One artist entry per real artist, featured artists credited, and a review report of the decisions left to the client. S01 is complete.

- **Result:** 47,399 songs, **14,482 artists** (from 15,660 printed credits), 267 auto-merged groups (spellings identical once case and punctuation are ignored), 2,083 songs listed under a featured artist as well. Featured split only on ft / ft. / feat / feat. / featuring; `&`, `+`, `,`, `and` and `with` never split. The song keeps its full printed credit.
- **Shipped data:** `public/data/songs.json` + `artists.json`, columnar format (A-006, `src/lib/dataset.ts`), **954,892 B gzipped (~0.91 MB)** against the 1.5 MB budget. Deterministic; `build:data` fails loudly if over budget.
- **QA:** `npm run qa` → pass (85 tests). Round-trip: all 47,399 songs reproduce exactly from the shipped files; every artist count reconciles. All 268 merged groups were inspected by eye; all 2,088 featured credits were audited. 10 mutations caught, plus the 2 gaps QA found, now covered.
- **Fixed after QA:** `B.O.B`/`Bob` and `M.I.A.`/`Mia` had been merged by the dot-dropping rule; the client-controlled `keepSeparate` option now keeps them apart. Marker left in a few cut-off credits, a glued `Horizonft.` credit and a stray bracket were fixed.
- **Open, client decisions (`data/reports/artists-review.md`):** (a) 150 of 960 near-match groups; (b) category names kept as artists (Unknown 568 = 438 printed + 91 printed `..` + 39 blank, Gospel, Ilocano Song, Visayan Song, Children Song, Traditional); (c) 39 `with` credits not split; (d) 428 truncated credits; (e) edge cases; (f) 32 merged-by-rule groups to confirm. `Beatles` and `The Beatles` stay separate by the conservative rule.
- **Notes for later tickets:** artist ids can contain dots (`b.o.b`), so routing and URLs must cope (T008). `Bury It feat. Hayley Williams feat. ...` keeps the second cut-off marker whole.
- **Blockers:** none.

## S02 / T004 — Search engine: normalise, title ranking, artist matching ✅ (2026-11-21)

**Goal met.** A pure-TypeScript engine (`src/lib/search/`, MiniSearch 7.2.0) that finds songs by title, forgives typos, ranks sensibly and suggests artists. No DOM or Node APIs, so it can run in a Web Worker.

- **API:** `buildIndex`, `searchSongs` (best 50, full `total`, `hasMore`), `suggestArtists` (max 3 strong matches, aliases shown canonically), `songsByArtist`.
- **Behaviour:** punctuation, apostrophes, brackets, diacritics and `&`/`and` ignored; AND across words with the last word as a prefix; tiers exact > starts-with > phrase > word-prefix > credit-only > typo. The artist credit is also searched, at lower weight, so `hotel california eagles` works; a title match always outranks a credit-only match.
- **Typo rule (measured on 600 real titles with one typo):** none under 4 letters, 1 edit for 4-5, 2 edits for 6+; recall 364/600 against 337 for the first proposal. Fuzzy only runs when fewer than 5 exact matches exist.
- **Dotted titles:** `Mr.Brightside`-style titles (106) are indexed under both spellings so `mr brightside` works; initialisms like `R.E.M.` stay joined. Shipped data and the normaliser are unchanged.
- **Measured (Node, 47,399 songs):** index build ~385 ms, per-query median 1.5 ms, **p95 ~14 ms** (budget 100 ms), worst ~77 ms. Serialised index 1.17 MB gzipped, larger than the dataset (0.95 MB), so T005 should build in the browser, not ship it prebuilt. Mobile build time (~1-2 s) is an estimate, not a device measurement.
- **QA:** `npm run qa` → pass (145 tests). Independent brute-force oracle over 320 queries: 0 disagreements. 200 typo cases at 6+ letters: 200/200 in the top 50. All 14,482 `songsByArtist` lists match their counts. 40 adversarial inputs: 0 throws, all < 100 ms. 42 mutations, the surviving gaps (fuzzy-gate threshold) now covered by a test.
- **Known limits, documented:** a typo in a 3-letter last word finds nothing until the 4th letter; 4-5 letter transpositions are often missed. Alias suggestions are only tested on synthetic data because the real data has no alias with a distinct normalised form.
- **Blockers:** none.

## S02 / T005 — Load the dataset and keep typing fast ✅ (2026-11-21)

**Goal met.** The song book loads once, the index is built in a Web Worker, typing never blocks, and a failed load shows a clear retry message. **S02 is complete.**

- **Decision (A-008, measured):** build the index at runtime in the worker. A pre-built index was worse in all 9 network/CPU cells: it saves 0.55-0.9 s of compute but costs 1.17 MB more transfer.
- **Typing:** the only long task during load is the page's own hydration; slowest key/input event while loading 16 ms; 0 characters lost; per-keystroke p95 41 ms at 4x CPU, 60 ms at 6x (one 6x outlier at 102 ms in 150 keystrokes).
- **Budget, stated honestly:** first results within 2 s **after the dataset has arrived** (client decision per the recommendation). From navigation start: ~1.7 s on Wi-Fi at 4x CPU, ~7.3 s on Slow 4G, ~10.4 s on Fast 3G, because the 0.95 MB data (0.74 MB Brotli) needs ~4.8 s at 1.6 Mbps. First visit only; repeat visits revalidate.
- **Reliability:** latest-request-wins protocol, queued latest-only before ready, retry bypasses the HTTP cache, main-thread fallback if no Worker. QA forced: 500s, offline then online, truncated/garbage/HTML responses, a 10 s slow load, a blocked Worker: always the documented message, never a blank page.
- **Bug found and fixed:** a songs/artists pair from two different imports (cache or CDN skew) could load silently with wrong artist attributions. Both files now carry a content-hash id (dataset format v2) and a mismatch is a load error that retry recovers. Song and artist content unchanged (47,399 songs, 14,482 artists, verified); size 954,949 B gzipped.
- **QA:** `npm run qa` → pass (192 tests); `npm run build` and `npm run e2e:smoke` pass; worker answers equal direct engine calls on 100 queries (0 differences); 17 protocol mutations, 16 killed, the survivor equivalent.
- **Tooling added:** `@playwright/test` 1.63.0 (exact, matches the cached Chromium; T009 reuses it); `vercel.json` cache headers (immutable assets, revalidated data); `scripts/serve-out.mjs`.
- **Not verified, open:** a real phone (CDP cannot throttle a worker's CPU, so compute figures come from the same code on the throttled main thread), Safari/Firefox workers, real Vercel headers (not deployed).
- **Cheap follow-up for T006/T009:** a preload hint so the data download starts at page load, not after hydration.
- **Blockers:** none.

## S03 / T006 — App shell: header, theme and search box ✅ (2026-11-21)

**Goal met.** The first real screens: header, sticky search box, theme toggle and the pre-typing home state, built to `docs/SHARED_COMPONENTS.md`.

- **Built:** 56px header (accent note, `SongHub` 800 + ` Songbook` 400, one 44x44 sun/moon toggle, nothing else); sticky 72px strip with the 56px field (muted magnifier, 48x48 clear X fully inside the field, `inputmode=search`, autofocus, accent focus ring, native cancel button hidden); dark by default regardless of the phone's setting, toggle switches for the session only (nothing stored); `?q=` mirrored with `replaceState` and restored on reload and back; inline SVG icons (no icon font); the home copy exactly per the spec. None of the known Stitch deviations were copied.
- **Visual check (recorded as the ticket asks):** screenshots at 390 px, dark and light, in `docs/design/built/`, reviewed by eye; header and field match the approved screens 2 and 6; the idle dark border after the change was also viewed.
- **QA:** `npm run qa` → pass (220 tests); `npm run build` and `npm run e2e:smoke` pass. An independent Playwright pass measured the spec table (header 56, strip 72, field 56, radius 16, clear 48, colours equal the spec hexes in both themes, contrast meets the table) at 320 / 360 / 390 / 430 / 1280 and landscape: no horizontal overflow. axe-core: 0 violations in both themes. Hostile and malformed `?q=` values (script tags, bad percent-encoding, 5,000 characters) never crash and render as text.
- **Preload (A-009):** a preload hint starts the data download at page load: time to ready on Slow 4G 10.3 s to 6.6 s (-35% in the agent's run, -9% vs A-008 in QA's). Cost: a harmless second conditional request (200 + 304 per file) and a console 'preloaded but not used' warning.
- **Fixed after QA:** at 4x text size the wordmark ran into the toggle (35 px overflow). The header is now `min-h-14` and the wordmark may wrap (56 px at normal size; 112 px with a 16 px gap at 4x). A test now pins the rule that hides the browser's own search clear button.
- **Client decision (A-010):** the dark idle border is raised from `#2A2E3B` (1.41:1) to `#6B7083` (3.89:1 against the page) to meet the 3:1 non-text guideline; the spec is updated.
- **Not verified, open:** real phone, iOS Safari, Firefox/WebKit (the native cancel-button hiding was checked in Chromium only), the on-screen keyboard, real OS text-size scaling, real Vercel headers.
- **Blockers:** none.

## S03 / T007 — Title results, hint row and empty states ✅ (2026-11-21)

**Goal met.** A guest types a title and sees song numbers, large and readable, appearing as they type.

- **Built:** the song row (88px at normal text, number 36px 800 accent in a 136px column, title 17/22 clamped to 2 lines, artist line showing the full printed credit, `ul`/`li` with no handlers or tabindex, pressed state), the top-50 list with the 64px hint row, the `No songs found` state with the echoed query, and mutually exclusive states (home / loading / error / list / empty). Screens: `docs/design/built/05` to `12`.
- **Correctness under timing:** the empty state never shows for an unanswered query (sampled every animation frame while typing fast on a throttled CPU, 0 violations); previous rows stay until the new answer arrives; punctuation-only input shows home; clearing then typing never shows the old query's rows; a new query scrolls back to the top and the first row sits directly under the sticky strip.
- **Real-data checks:** 100 random rows equal the dataset exactly (title, printed credit, number); the 39 songs with no artist show no gap; every 5-digit number fits the 136px column (widest ~118px); injected markup renders as text. Boundaries verified with the real engine: 49 and 50 results show no hint, 51 and 52 show 50 rows plus the hint.
- **QA:** `npm run qa:full` → pass (257 tests, build, 18 e2e steps). axe-core: 0 violations in 14 runs (both themes, all states). Keystroke-to-new-rows about 36 ms at 4x CPU (p95 45); scrolling 50 rows shows no jank; results arrive through the worker. 21 mutations caught; 5 survivors from the first QA pass are now covered.
- **Bug found and fixed (A-011):** with enlarged text (Android font scale), the 5-digit number overflowed its fixed 136px column and drew over the title (at 1.3x, 40 of 50 rows). The column is now `min-width: 136px` and the row `min-height: 88px`: identical at normal size, growing when text is enlarged; 0 overlap from 1.15x to 2x at 320 and 390 wide. Side effect: with enlarged text, titles start further right on 5-digit rows. The spec is updated.
- **Also:** the row memo now compares `n`, `title` and `credit` so only genuinely new rows re-render (worker replies are fresh copies); the long-query echo keeps its closing quote and period directly after the ellipsis; the `qa:full` script now exists (qa, build, e2e smoke).
- **Decision for T008:** an artist's list can reach 568 rows. A-011 records that variable row height rules out fixed-height windowing; use `content-visibility: auto` with `contain-intrinsic-size: auto 88px`.
- **Behaviour confirmed:** typing replaces history, so Back from a typed query leaves the app. T008 adds one history entry when an artist is opened.
- **Watch item:** one `npm run qa` run showed 2 failing unit tests that passed on immediate re-run; 4 further full-suite runs were all green. Probably load from heavy parallel jobs. If it recurs, look at the integration tests' timeouts.
- **Not verified, open:** a real phone, Safari/WebKit (`-webkit-line-clamp`, `:active` on touch), real Android font scaling (emulated with a CSS multiplier), VoiceOver/TalkBack reading the live region.
- **Blockers:** none.

## S03 / T008 — Artist matches and the artist song list ✅ (2026-11-21)

**Goal met.** A guest types an artist, taps the match, and sees every song by that artist.

- **Built:** up to 3 artist rows above the songs (64px, name, `N songs`, chevron) as real `<a href>` links with `ARTISTS`/`SONGS` labels (SONGS only when ARTISTS shows); the artist view (80px heading block, 44x44 back chevron, name 24/30, count including featured songs) listing the artist's full A-Z list with the same song row as T007; Spec colours: song numbers Inter 800 accent, accent focus border (none of the Stitch flaws copied). Screens `docs/design/built/13` to `18`.
- **Navigation (A-012):** opening an artist adds exactly one history entry, so Back returns to the results with the box text and scroll position restored; the back chevron does the same, or on a direct `?artist=` load replaces the URL with `?q=` instead of leaving the app; editing or clearing the box leaves the view; reload restores it; unknown or malformed ids (empty, nonexistent, bad encoding, script text, 5,000 characters, duplicates) fall back to normal results with no crash; `b.o.b` and the other dotted id round-trip; ctrl- and middle-click open a new tab with the right URL.
- **Data correctness:** all 14,482 artist counts equal the songs-derived counts; 64 artists (the top 10, `unknown`, merged aliases, featured-only artists, count-1) show exactly `count` rows in A-Z order, with credits as printed; the count in an artist row equals the count in its view.
- **Speed (the largest list, 568 songs, `content-visibility: auto`):** first paint 47 ms at 1x, 86 ms at 4x, 120 ms at 6x CPU; no long task; scrolling worst frame 18-28 ms. With `content-visibility` forced off: 165 ms at 4x with a 105 ms long task, so the choice is justified. Opening a view while typing stays responsive (30 ms).
- **QA:** `npm run qa:full` → pass (317 tests, build, e2e). axe-core: 0 violations in 12 states plus the 568-row view. 13 mutations caught. Rapid-click and Back/Forward races: never a blank screen or mismatched heading and list.
- **Bug found and fixed:** a tap moved focus to the heading and the live region said the same `<name>, N songs` 1 ms later, so a screen reader would likely read it twice. The live region now announces the artist only where focus does not move (a direct load or Forward). Both paths are tested; not verifiable without VoiceOver/TalkBack.
- **Flaky test explained and fixed:** the intermittent `npm run qa` failure seen since T007 was the real-data test "every title with a dotted word is found", exceeding its 5 s default timeout (5.17 s) on a busy machine. Its timeout is now 30 s.
- **Notes:** the heading block is `min-height: 80px` (exactly 80 with a one-line name, 105 with two lines at 320 wide); a reload on an artist page no longer restores scroll (manual scroll restoration, documented); a bare `?artist=` is harmless and left in the address bar; two blank frames can occur at 6x CPU while the big view loads.
- **Not verified, open:** a real phone, Safari/WebKit, Firefox, VoiceOver/TalkBack, the iOS back-swipe and bfcache, the on-screen keyboard opening when Back refocuses the search box.
- **Blockers:** none.

## S03 / T009 — Accessibility, performance and end-to-end checks ✅ (2026-11-22)

**Goal met.** The app is verified as readable, fast and usable one-handed, and `npm run qa:full` is now the real gate. **S03 is complete.**

- **The gate:** `npm run qa:full` = unit (331 tests) + build + a Playwright suite of 169 end-to-end tests (mobile 390x844, plus a 1280 desktop layout project). Three consecutive full runs, plus the gate itself, all green with no retries. Every assertion in the old smoke script was mapped to a new test (none dropped). The fresh-copy run (`npm ci` then `qa:full` in a clean directory) passes; it needs network for `npm ci` and for the Inter font at build, and a Playwright Chromium (`npx playwright install chromium`, in the README).
- **Accessibility:** axe-core 4.14.1 reports 0 violations on 7 states x 2 themes at 390 and 320 wide and with enlarged text (42 runs). Keyboard and screen-reader semantics are asserted: tab order, 2px accent focus ring on every stop, Enter opens an artist, Escape clears, focus lands on the artist heading and returns to the box, one live region announcing once per settled query, names and roles.
- **Contrast and tap targets:** computed from rendered colours in both themes and compared with the approved spec table (independently recomputed by QA from the spec hexes); the dark idle border is >= 3:1 (A-010); a sweep over all drawn text in 7 states meets AA; every interactive element is at least 44x44.
- **Performance (A-014, final build, throttled Chromium, cold cache):** first results 0.41-0.47 s after the data has arrived (budget 2 s); keystroke p95 38-54 ms and worst 66 ms (budget 100 ms); dataset 954,949 B gzipped (budget 1.5 MB); the largest list (568 songs) opens in 72-77 ms at 4x and 111-119 ms at 6x. **Not met under the original 'within 2 s of load' wording:** on Slow 4G first results appear about 6.7 s after navigation, because the first-visit data download alone takes about 6.3 s. The client accepted the 'after the dataset has arrived' wording. The suite's regression gate is p95 < 100 ms, median < 70 ms, first results after data < 2.5 s (plus a 3x baseline guard); a 60 ms artificial delay is caught by the median.
- **SEO (A-013):** one title, description, canonical; Open Graph and Twitter card with absolute image URLs derived at build time from Vercel's automatic environment variables (a local build bakes `localhost`, so only Vercel builds are deployable); a WebSite JSON-LD with an exact SearchAction; `robots.txt` (index allowed); favicon (svg and ico), 180px touch icon, 1200x630 social card (35 KB); a short home-screen title 'SongHub'; no manifest (not an installable app); no analytics, cookies or storage, same-origin requests only.
- **Bugs found and fixed by QA:** the favicon, touch icon and social card drew the note with one head instead of two (the code test only compared the first circle; it now parses and compares every shape of the real icon against all three sources); the font licence text was missing next to the Inter copy (OFL added); the performance gate was too loose and untested for the data preload (tightened, preload asserted); the test server served PNGs without a content type; device-checklist wording fixed. Mutation checks: 13 mutations, 11 caught first time, the 2 misses now covered.
- **Pending client approval:** the favicon, touch icon and social card are new visuals built from the approved brand elements only (amber note, near-black, Inter) and are not in the Stitch design. Whether to add an Inter licence credit to the shipped site is also the client's call (A-013).
- **Not verified, open:** a real phone and Safari, VoiceOver/TalkBack wording (including whether the artist name is read twice after a tap), WebKit/Firefox, real CDN headers, social scrapers rendering the card, an offline `next build`. `docs/DEVICE-CHECKLIST.md` is the manual pass for the client (17 steps).
- **Blockers:** none.

---

## ✅ Sprint S03 — Search UI: COMPLETE (T006-T009)
End state: a working mobile-first search app. A guest types a title (typos forgiven) and sees large song numbers; types an artist, taps, and sees every song by them; Back, deep links, theme toggle and enlarged text all work; the build is gated by 331 unit and 169 end-to-end tests. Remaining: S04 release (T010 deploy to Vercel, T011 runbook).

## S04 / T010 — Deploy to Vercel ✅ (2026-11-24)

**Goal met.** The song book is live and public at **https://songhub-songbook.vercel.app**, hidden from search engines.

- **Client decisions:** deploy to Jason Jara's projects (Hobby) as `songhub-songbook`; public but not searchable. Approved going public after reviewing the deployment.
- **Done:** project created and linked to GitHub; Node pinned to 22.x on Vercel; noindex (meta tag, `X-Robots-Tag` header from `vercel.json`) with `robots.txt` allowing crawling so link previews work; JSON-LD dropped; login wall limited to preview deployments (A-015, A-016).
- **Verified live:** `npm run test:live` against the real CDN: 179 passed, 2 skipped by design, 0 failures (accessibility, contrast, layout, search, artists and history, SEO, fault injection, plus HTTPS redirect, HTTP/2, Brotli, caching, 304s, 404 pages, preview bots). I re-checked the key points by hand. Live performance: first results ~0.5 s after the data arrives, keystroke p95 56 ms, dataset 880 KB over the wire.
- **Mistake, recorded:** the project's first deployment is made production automatically; it went live before approval (briefly open, about three minutes, noindex) after I loosened the protection setting. Locked immediately, opened only after the client approved. Details and the rule for next time in A-016.
- **Open:** the client should check Vercel's Hobby-plan terms (non-commercial use) if the app serves a business; test on a real phone (`docs/DEVICE-CHECKLIST.md`); `main` still holds only the scaffold until the sprint PRs are merged (production redeploys from `main` then).
- **Not verified:** real phone and Safari, real Slack/WhatsApp/Facebook/X rendering, other regions, Vercel bot protection under real bot IPs.
- **Blockers:** none.

## S04 / T011 — Runbook: how to re-import a new PDF ✅ (2026-11-24)

**Goal met.** The owner can update the song book from a new SongHub PDF with a few commands and a README written for a non-developer. **S04 is complete, and so is the project plan.**

- **README:** one-time setup (tools table, `nvm`/Node 22.23.1, poppler, Playwright browser), the 8-step update flow with an expected-output line for every step, numeric stop rules (rows more than 2% from 47,399, rejected above 0, duplicates above 0, the balance line must say `balanced, nothing dropped silently`), how to read `import.md` and `artists-review.md`, how to approve merges or keep artists apart, the exact five paths to commit (never the PDF), deploy by pull request to `main`, the live check (`test:live`), rollback, and a 17-row troubleshooting table.
- **Dry run:** from a clean state, `npm run import` and `npm run build:data` twice give byte-identical files that equal the committed ones (md5 of all five); dataset id `4d101923bb85a174` unchanged. A simulated update (3 changed or added rows) changed the dataset id, left 14,481 of 14,482 artists byte-identical, and updated the review report.
- **QA, following the README literally in a fresh copy:** `npm ci`, import, build:data, build, a real merge edit and its revert, local serve and a real-browser search, `npm run qa:full` (341 unit, 174 end-to-end, 261 s). QA found a data-loss hazard and fixed it: the first merge example in Step 6 was a whole file, so pasting it silently replaced the owner's two keep-apart decisions. The README now shows the whole file with the new line marked, a bold never-replace warning, and the check `keepSeparate groups applied: 2`.
- **Other QA fixes:** `data/source/` does not exist in a clean clone (now `mkdir -p`); a misnamed merge file used to be silently ignored (`build:data` now warns and says so in the report); a bad-JSON merge file printed a stack trace (now one clear line); Vercel wording is by effect, not dashboard labels; terminal and git terms glossed; the 130-versus-39 empty-artist counts explained.
- **Tests:** a README test (25 tests) checks every `npm run` script, every path, the serve port, the five `git add` paths, the quoted counts and id against the real reports and data, the quoted error messages against the source, and every section letter; 21 README or code mutations each fail exactly one test. `npm run qa` → 28 files, 364 tests, pass.
- **Maintenance note:** the quoted figures in the README (47,399 rows, the dataset id, 39, 130, 91) go stale after the next published book; the README test fails until a developer updates them.
- **Not verified:** a different machine, macOS and Ubuntu install commands, Windows/WSL, the Vercel dashboard click paths, a real changed PDF.
- **Blockers:** none.

---

## ✅ Sprint S04 — Release: COMPLETE (T010, T011)
End state: the song book is live at https://songhub-songbook.vercel.app (public, hidden from search engines), verified in a real browser on the real CDN, with a runbook the owner can follow. All 11 tickets are done.

