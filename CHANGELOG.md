# Changelog

All notable changes to Cavepicks, newest first.

## 2026-08-30 (evening, big update)
- **New: postponed/cancelled game handling.** Games can be marked "voided" - they no longer block their whole week's pot from resolving, and no picks on them ever get graded (no win/loss/push either way)
- **New: Admin page** at `/admin`, password-protected (set `ADMIN_PASSWORD` as an env var). Lets you void a postponed game with a reason, un-void it, or manually set a final score (which immediately grades every pick on that game) - for fixing exceptions the automatic pipeline can't handle on its own
- **New: Week navigation** (&larr; Prev / Week N / Next &rarr;) added to both My Picks and The Board. Past and future weeks show a read-only view; only the actual current week is interactive for picking/locking
- Fixed 3 more instances of the same JSX-unicode-escape bug from earlier (em-dashes rendering as literal `\u2014` text instead of the actual character) - found via systematic sweep before shipping this time, not by trial and error

## 2026-08-30 (afternoon)
- Fixed three real bugs on the standings page, found via a live page fetch that caught a literal blank ("Week 1:  won $350" with no name) proving future/unplayed weeks were being misread as "someone won":
  1. Pot History now correctly distinguishes "hasn't happened yet" from "tied" from "someone won" - previously any ungraded future week silently fell through to the "won" branch with a null winner
  2. The "current week" card now finds the week matching today's actual date, instead of assuming whichever week happened to be last in the list (broke once future placeholder weeks existed)
  3. Week 0 is now fully excluded from all pot and leaderboard math - it was test/setup data, not a real played week; Week 1 is the true start of the season

## 2026-08-30 (way too late night, cont.)
- Added a "Refresh lines" button to the pick sheet - does a soft refresh of just the data (no full page reload, no lost scroll position), so you can deliberately check for line movement before locking without needing to reload the whole page

## 2026-08-30 (way too late night)
- Fixed a real correctness bug: clicking Lock In was re-fetching whatever the *newest* odds snapshot happened to be in the database at that moment, not the line actually shown on screen. If a background pull updated a line while someone had the page open, locking would silently grab the new number instead of the one they were looking at. Lock In now always freezes exactly the value displayed on screen at the moment of the click.

## 2026-08-30 (very late night, cont.)
- Rules page now explains exactly when a new week's slate appears (midnight Tuesday Central) and that some lines may still be filling in early in the week

## 2026-08-30 (very late night)
- Fixed a real timezone bug: week boundaries were computed using the server's local time (UTC on Render), not Central time like the rest of the app - meaning the week would have actually rolled over around Monday ~7pm CT instead of the intended Tuesday midnight CT
- Unified week-number calculation and the Tuesday-Monday display window into one Central-time-aware source of truth (`lib/lock.ts`), so the two can never disagree with each other again like they previously could
- Verified with explicit test cases against known dates before shipping

## 2026-08-30 (late night)
- Fixed a serious bug: none of the 10 API routes were marked as dynamic, meaning Next.js could silently cache a route's entire response and keep replaying the same frozen snapshot forever, never actually re-running the code. Confirmed on `debug-weeks` (identical timestamp on repeat calls) and fixed everywhere at once by adding `export const dynamic = "force-dynamic"` to all 10 routes, removing any ambiguity about which ones Next.js's caching heuristics would or wouldn't affect

## 2026-08-30 (evening)
- Fixed a real bug: games were being filed under whatever week was "current" at pull time, instead of the week matching their own kickoff date. This meant any game whose odds got posted early (next week's games, for example) would get permanently stuck under the wrong week forever, even after the calendar rolled over
- Every odds pull now assigns each game to its own correct week, and self-corrects any previously-misfiled game on every subsequent pull
- Hardened `wipe-week-zero` to require an explicit `?confirm=yes-wipe-week-0` - a plain visit or link-preview fetch can no longer trigger it
- Added `debug-weeks` diagnostic endpoint to inspect data counts per week
- Removed remaining "side picks" wording from the rules page

## 2026-08-30 (later)
- **New: Rules / How This Works page** at `/rules`, linked in nav - combines game rules, lock timing, money structure, and a site navigation guide in one place
- **New: odds/juice display** - spreads, totals, and dog picks now show their price (e.g. `-110`) both live and once locked, on the pick sheet and the board, so lines can be eyeballed for being "too juiced"
- Fixed a real bug in odds parsing: totals only ever captured one side's price, silently assuming Over and Under always shared identical juice
- Fixed Cavedogs payout: corrected from winner-take-all to the actual $400/$200/$100 split for 1st/2nd/3rd place, now shown directly in the standings table
- **New: one-time Week 0 wipe endpoint** (`/api/wipe-week-zero`) - deletes all Week 0 picks, odds snapshots, and games, and the week row itself; never touches users or other weeks; safe to re-run
- Nav bar now wraps gracefully with the 4th link added

## 2026-08-30
- Added season-long **Cavepicks Leaderboard** to standings page (Weeks Won, Wins, Pushes, Losses, %)
- Added season-long **Cavedogs Leaderboard** to standings page (Points, Wins, Losses, %), replacing the simple points list
- Capitalization fixes: "The Board" page title, "{Name}'s Picks" page title, "My Picks" nav label
