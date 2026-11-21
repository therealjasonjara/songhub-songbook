# STORYBOARD — SongHub Songbook

**Project:** A fast, single-purpose web app for looking up songs in the SongHub karaoke song book
**Slug:** `songhub-songbook`
**Date:** 2026-11-21
**Status:** Approved (2026-11-21)

---

## 1. Project Overview

Guests at a karaoke venue need the song number to enter at the machine. The SongHub song book is a 384-page PDF with about 47,000 songs, which is slow to search by hand. This app lets a guest type a song title and see its number immediately, or type an artist and see every song by that artist. It is built for phones first.

---

## 2. Users & Roles

| Role | Description |
|------|-------------|
| Guest | Anyone at the venue with a phone. Opens the page, searches, reads out or types in the number. No login. |

There is no admin role. The song book is updated by re-running an import on a new PDF.

---

## 3. Core Features

### Search by title
- One search box at the top, focused when the page opens
- Results appear as the user types, with no search button
- Forgives typos and ignores case, punctuation, apostrophes and brackets (for example `hotel californa` still finds *Hotel California*, and `di ka na others` finds *'Di Ka Na Others*)
- Each result shows the **song number large**, with the title and artist smaller

### Search by artist
- Typing an artist name shows the matching artist or artists
- Choosing one lists every song by that artist, including songs where they are featured (`ft.`)
- Different spellings of the same artist appear as one artist

### The result list
- Handles 47,000 songs without lag
- Clear empty state ("No songs found") and a prompt before anything is typed

---

## 4. Key Flows

### Find a song by title
```
Open page → type part of the title → results appear as you type → read the large song number
```

### Find songs by an artist
```
Open page → type artist name → pick the artist from the matches → scroll the list of their songs → read the number
```

---

## 5. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js, static export, TypeScript | Static pages host cleanly on Vercel with no server |
| Styling | Tailwind CSS | Quick, consistent mobile-first styling |
| Search | MiniSearch, in the browser | Instant typo-tolerant results over 47K songs |
| Data | One-off import script from the PDF to static JSON | Nothing to run or pay for after deploy |
| Backend, database, login | None | Read-only public data |
| Hosting | Vercel | As requested |

Full versions and reasoning are in `DECISIONS.md`.

---

## 6. Out of Scope (MVP)

- Favourites, search history, or "my queue" lists
- Offline use or an installable app
- An admin screen for editing songs
- Accounts or login
- Lyrics, audio, video or any song details beyond number, title and artist

---

## Open Questions

1. **How aggressive should artist merging be?** I recommend merging only spellings that are identical once case, punctuation, quotes and spacing are ignored. Looser near-matches (for example a likely typo) would go in a short report for you to review, because a wrong merge would hide one artist's songs under another.
2. **Should the PDF's wrapped rows be fixed silently or reported?** I'll fix those I can read with confidence and list any I can't, so you see exactly what was skipped.
3. **Is the song list fine to publish at a public URL?** The deployed site will show the whole song book to anyone with the link. I'll ask once more right before the first deploy.

---

## Approval

- [x] Storyboard approved (2026-11-21). Open questions 1 and 2 accepted as recommended; question 3 is re-asked before the first deploy.
