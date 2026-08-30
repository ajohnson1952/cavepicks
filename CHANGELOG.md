# Changelog

All notable changes to Cavepicks, newest first.

## 2026-08-30 (line source)
- **Transparency**: every game on the pick sheet and every locked pick on both the pick sheet and the board now shows which sportsbook its line came from (e.g. "odds via FanDuel", or "(-6.5 -110, DraftKings)" on a locked pick). New `sourceBook` on each odds snapshot and `lockedBook` frozen onto each pick at lock time (set by all three lock paths - manual, auto-lock sweep, grading safety net; cleared on unlock). Rules page explains the FanDuel-then-DraftKings-then-BetMGM order
- **Real fix**: odds no longer depend on a single sportsbook. Diagnosed via a new debug endpoint that ~15 Week 1 games (the late-Saturday / Sunday / Monday kickoffs) had no line - not because DraftKings.com hadn't posted them, but because The Odds API's *DraftKings feed* for CFB lags its own site by a day+ for those windows. Switched primary book to FanDuel (earliest, most complete for CFB), but FanDuel has its own occasional gaps (e.g. it was missing UMass @ Rutgers, which DraftKings had). Each pull now requests **FanDuel, DraftKings, and BetMGM in one call** (no extra API cost - billing is markets x regions, not book count) and each game uses the first of those that has a real line. Result: every game that any of the three has priced now shows a number. The pull response and debug endpoint report which book each line came from
- **Fix**: the pick sheet hid a game entirely ("Odds not posted yet") unless the book had posted the spread *and* the total. Early in the week a book can post one before the other, so a game with half a line looked completely blank. Spread and total sections are now gated independently - whichever side has a line shows and is pickable, the other stays hidden until it posts
- Added `/api/debug-odds?week=N` - per-game snapshot counts and latest values; `&live=1` compares against a fresh pull and breaks down line source by book; `&probe=1` does one all-books call to show which sportsbooks The Odds API has for any still-lineless game

## 2026-08-30 (night, matching overhaul)
- **Real fix**: replaced substring-containment team matching with word-overlap matching - a candidate now only counts as a match if EVERY one of its words appears as a whole word in the odds API name, not just any character-level substring. This structurally fixes the whole class of "short name wins over longer specific name" bugs: Albany vs Albany State, Arkansas vs Arkansas Pine Bluff, Houston vs Houston Christian, and more, tested against 8 cases before shipping
- **Real fix**: the `"louisiana"` alias was matching inside ANY team name containing that word - including "Louisiana Tech Bulldogs," silently corrupting it to redirect toward Louisiana-Lafayette. Narrowed to the exact phrase that actually needed it
- Admin page now shows team logos and abbreviations matching the pick sheet's style, plus the full team names underneath for verification

## 2026-08-30 (full app review)
Systematic pass through the entire codebase, checking for structural bugs, dead code, and logic inconsistencies. Found and fixed:
- **Real bug**: `unlockPick` reset `lockedLine` and `dogSpreadValue` on unlock but forgot `lockedOdds`, leaving stale juice data behind (invisible in the UI currently, but incorrect data hygiene)
- **Real bug**: if a pick somehow never got a real line locked in (extreme edge case - no odds snapshot ever existed, or even the cached fallback only had null values), grading would silently default to a fake line of 0 instead of excluding the pick fairly. Now skips grading entirely rather than guessing
- **Display bug**: dog pick locked-detail text showed `", ML"` with an empty gap when odds were unexpectedly null, instead of omitting that part cleanly - fixed on both the pick sheet and board
- **Dead code removed**: `submitPicks` and `lockSelection` (superseded by `autosaveSelection`/`lockValue`, but never deleted - also carried the old, already-fixed "always use today's calendar week" bug pattern), `lockPick` (superseded by `lockValue`'s exact-on-screen-value locking)
- **Dead infrastructure removed**: the entire `WeeklyPot` database table and its `resolveWeeklyPot`/`dogPotTotal` helper functions were never actually used anywhere - the pot logic has always been computed fresh from Pick/Game data on every page load instead. Removed the unused model, its relations on User/Week, and the dead functions
- **Dead CSS removed**: `.locked-detail`, `.pot-amount`, `.status-pill` (+ 3 variants), `.leaderboard-lead` - leftover from earlier iterations of these pages before later refactors, never referenced by any component
- Verified consistency across all three pick-locking code paths (manual Lock In, auto-lock sweep, grading's safety-net lock) for the `lockedOdds` field
- Verified the standings page's week-filtering, pot-carry, and current-week-detection logic all still hold correctly given every downstream change (voided games, picking ahead on future weeks, Week 0 exclusion)
- Verified `WeekNav`, the admin page's own duplicate nav logic, and `Nav.tsx`'s active-path detection are all consistent with each other
- Confirmed no remaining stale references to any previously-renamed/removed function across the whole app

## 2026-08-30 (night, cont. 2)
- Locking is now restricted to the current week only - you can still browse and select picks ahead of time on future weeks, but the Lock In button is hidden (and blocked server-side too, not just in the UI) until that week actually becomes current. Prevents anyone from freezing a line a month out before the market's settled
- Rules page updated to reflect this

## 2026-08-30 (night, cont.)
- Fixed far-future games showing "?" instead of a clear "odds not posted yet" message. A snapshot row gets created for every game on every pull, even before DraftKings has real numbers - the display was checking whether that snapshot *existed* rather than whether it actually had real values in it

## 2026-08-30 (night)
- Players can now pick and lock ahead on future weeks, not just the current one - the per-game auto-lock logic already handled this correctly, so the "current week only" restriction from the last update was unnecessary and has been removed
- Fixed a real bug this exposed: locking a pick always filed it under today's calendar week regardless of which week the actual game belonged to - now correctly uses the game's own week, so each week's 5 picks + dog pick are tracked independently
- Removed the separate read-only view for past/future weeks entirely - the same interactive pick sheet now handles every week uniformly, since already-started games naturally render as locked via existing logic
- Rules page updated to explain picking ahead

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
