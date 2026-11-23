# SHARED_COMPONENTS — SongHub Songbook (APPROVED 2026-11-21)

Contract every screen and every UI ticket must match. Mobile 390x844. Font: Inter (tabular numerals on). 4px base unit, 16px page margin. Min tap target 44x44.

## Themes (default DARK; header toggle switches)
| Token | DARK (default) | LIGHT |
|---|---|---|
| page background | #0E0F14 | #FAF8F5 |
| surface / pressed row | #181A22 | #FFFFFF (pressed #F1EDE6) |
| input background | #20232E | #FFFFFF |
| input border idle | #6B7083 1px (was #2A2E3B; raised 2026-11-21 for 3:1 non-text contrast, client decision) | #6B7083 1px |
| input border focus | #FFC933 2px | #9A4300 2px |
| divider | #2A2E3B 1px | #E3DED6 1px |
| text primary | #F4F5F8 | #14151A |
| text secondary | #A9AEBD | #4B5063 |
| text muted | #8A90A3 | #6B7083 |
| accent (song number, icons, focus) | #FFC933 | #9A4300 |
| on-accent text | #1A1300 | #FFFFFF |

Contrast (WCAG AA min): dark song number 12.4:1 on bg; title 17.5:1; artist 8.6:1; muted 6.0:1; placeholder 4.9:1. Light song number 6.2:1; title 17.2:1; artist 7.5:1; muted/placeholder 4.6:1. Re-check against rendered screens in the audit. No error red needed.

## Type scale (Inter; min body 14px)
| Role | Size/line | Weight | Notes |
|---|---|---|---|
| Song number | 36/40 | 800 | accent, tabular, letter-spacing -0.01em |
| Artist heading | 24/30 | 700 | max 2 lines |
| Wordmark | 20/24 | 800 (Songbook part 400) | |
| Row title / artist-match name | 17/22 | 600 | title clamps 2 lines |
| Search input | 18/24 | 400 | >=16px (no iOS zoom) |
| Body messages | 16/24 | 400 | |
| Row artist, counts, hints | 14/20 | 400 | text secondary |
| Section label | 12/16 | 600 | uppercase, tracking 0.08em, muted |

Radius: input 16, buttons 12. List rows full-bleed with hairline dividers, no card boxes.

## Components
1. **Header** 56px, bg page, 1px bottom divider, scrolls away. Left: 24px accent music-note + wordmark "SongHub" (800) + " Songbook" (400, secondary). Right: 44x44 sun/moon toggle, 24px icon, secondary. Nothing else.
2. **Search input** wrapper 72px sticky at top (8px v-padding, bg page); field 56px tall, full width minus margins, radius 16. Left 24px magnifier (muted) 16px inset, text starts 52px in. Right clear (X) 48x48 hit, 20px icon, only when text. Placeholder "Search song or artist". Autofocus; inputmode=search; enterkeyhint=search; autocorrect/autocapitalize off. **One box, no toggle (option A):** songs always show; up to 3 strongly matching artists (name starts with the text or close fuzzy match) appear in an ARTISTS section above songs; weak matches hidden.
3. **Song row** 88px minimum height (`min-height: 88px`; exactly 88px at normal text size, it grows only when the guest enlarges their text; fixed-height windowing is not assumed), 16px side padding, 1px bottom divider. Left column `min-width: 136px` (exactly 136px at normal text size, `width: auto`, `flex-shrink: 0`, so it grows with the number and the title never sits under it): song number (36/40, 800, accent, left-aligned, vertically centred). 12px gap, then text block centred vertically: title (17/22, 600, primary, max 2 lines) over artist (14/20, 400, secondary, 1 line, 2px gap). Featured credit shown as printed ("Pitbull ft. Kesha"). Whole row one tap target with pressed colour; tapping does nothing; no chevron, no highlighting of matched letters. Title results ordered by relevance; artist song list A-Z by title.
4. **Result limits** Title results capped at 50 rows (search runs over the full set). If >50 match, a 64px hint row: "Showing the top 50 matches. Keep typing to narrow down." (14/20, muted, centred). Artist song list uncapped, and kept cheap to draw without assuming a fixed row height (rows are 88px minimum, A-011).
5. **Artist match row** 64px, 16px padding, 1px divider. Left name (17/22, 600, 1 line ellipsis). Right "128 songs" (14/20 secondary) + 20px muted chevron, 8px apart. Section labels: 32px strip, 12px caps muted, 16px inset: "ARTISTS" above artist rows, "SONGS" above songs (only shown when ARTISTS is visible). Spelling variants merged: one artist once. Built as a real link (`<a href="?q=<q>&artist=<id>">`) whose name is `<name>, N songs`; a plain tap opens the artist in the app (A-012).
6. **Artist heading** (after tapping an artist) search box stays pinned with its text; editing it leaves artist view. Heading block 80px, bg page, 1px bottom divider: 44x44 back chevron (primary) returns to previous results; 8px gap; artist name 24/30 700 (max 2 lines); below, "128 songs" 14/20 secondary (count includes featured). The block is `min-height: 80px`: exactly 80px with a one-line name, it grows for a two-line name or enlarged text (A-012). Back and the browser Back button return to the results at the same scroll position.
7. **Empty state** centred, 64px below the search box, box stays focused: 48px muted magnifier, "No songs found" (20/28, 700), 16px below; `Nothing matches "xyzq".` (16/24 secondary, one line; a long query is cut with an ellipsis directly followed by the closing quote and period); "Check the spelling, or try fewer words." (14/20 muted). No buttons.
8. **Pre-typing home** header, focused search box, then centred 64px below: 48px accent music-note, "Find your song number" (20/28, 700), "Type a song title or an artist." (16/24 secondary), "About 47,000 songs" (14/20 muted). No examples, history or suggestions.
9. **Page banner / footer:** none.

## Stitch design system mapping
Roundness ROUND_TWELVE; Inter for headline/body/label; colour mode DARK; seed #FFC933 with the neutral/background overrides above.

## Screens (mobile 390x844)
1 Home/pre-typing. 2 Title results ("hotel californa", ~5 rows + the top-50 hint row). 3 Artist matches ("eagl": ARTISTS section of 3, then SONGS). 4 Artist song list (heading with count; rows incl. a featured credit). 5 No results. 6 Title results in LIGHT theme.

## Decisions taken with the approval (client approved the spec; side questions defaulted to the recommendations)
Search/artist handling A (one box); theme toggle kept (choice not persisted beyond the session); light-theme screen included; search stays at the top per the storyboard; no non-Latin text in the book (checked); song numbers max 5 digits (checked).
