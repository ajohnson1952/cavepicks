# CFB Pick'em

Next.js + Prisma + Postgres, deployed on Render.

## Rules → schema mapping

- **5 picks/week**: SPREAD or TOTAL type `Pick` rows, graded win/loss/push against `lockedLine`.
- **1 dog pick/week**: DOG type `Pick`, graded straight-up. Win pays `dogSpreadValue` points
  (the underdog's spread magnitude at lock time); loss pays 0. No push.
- **Two odds pulls**: `OddsSnapshot.snapshotType` is `"early"` (informational, shown before lock)
  or `"lock"` (frozen values copied into `Pick.lockedLine` / `Pick.dogSpreadValue` when the user submits).
- **Main standings**: win/loss record across SPREAD + TOTAL picks per week.
- **Dog race**: `sum(Pick.pointsEarned)` across all DOG picks, season-long, tracked completely
  separately from the main standings — this is its own leaderboard.

## Not yet built (next steps)

- `scripts/pull-odds.js` — calls The Odds API (`americanfootball_ncaaf`), writes `OddsSnapshot` rows.
  Pulls the whole week's slate in one call (3 markets × 1 region = 3 credits) — cheap even on free tier.
- `scripts/grade-results.js` — polls ESPN's public scoreboard endpoint
  (`site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard`), matches by
  `espnEventId`, fills in `Game.homeScore/awayScore`, calls `gradePick()` from `lib/scoring.ts`.
- Auth (magic link or Google OAuth recommended for a friend group).
- Pages: pick sheet, main standings, dog race leaderboard.

## Setup

1. `npm install`
2. Create a Render Postgres DB, set `DATABASE_URL`
3. `npx prisma migrate dev --name init`
4. Get an Odds API key from the-odds-api.com (double check the domain — see impersonator warning on their site), set `ODDS_API_KEY`
5. `npm run dev`
