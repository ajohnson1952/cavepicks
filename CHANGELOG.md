# Changelog

All notable changes to Cavepicks, newest first.

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
