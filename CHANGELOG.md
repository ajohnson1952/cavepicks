# Changelog

All notable changes to Cavepicks, newest first.

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
