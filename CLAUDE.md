# Cavepicks

Private college football pick'em site for 7 friends. Next.js 14 (App Router)
+ Prisma + Neon Postgres, hosted on Render free tier, deployed via GitHub.

**The person maintaining this is a coding novice.** No local dev environment.
Claude commits and pushes changes directly to `main` on GitHub; Render
auto-deploys from `main`. Keep commit messages to a single clear line and
explain what changed in plain terms when handing back.

Live site: cavepicks.onrender.com
Rules page (source of truth for game rules): cavepicks.onrender.com/rules

## Commands

- Build: `npm install && npx prisma generate && npx prisma db push && npm run build`
  (this is Render's actual build command - `prisma db push` applies schema
  changes directly, there is no migrations folder)
- No local dev server is used day-to-day - changes go straight to GitHub -> Render

## Game rules (don't relitigate these without asking)

- 5 side picks/week (any mix of spread + total, any games, can double up on
  one game) + 1 dog pick (moneyline pick on an underdog)
- Dog pick pays points = the spread magnitude it was getting, only if it
  wins outright. 0 if it loses. No push.
- Games auto-lock **30 minutes before that specific game's own kickoff** -
  this is per-game, not per-week. A player can manually "Lock In" any pick
  earlier than that.
- Manual Lock In freezes **exactly the line/odds shown on screen at the
  moment of the click** - it must never re-fetch a fresher line
  server-side. This was a real bug once (see Gotchas).
- Weekly pot: $25/head, winner-take-all (most correct picks that week),
  ties roll the pot into next week (stacks with next week's buy-ins)
- Season-long "Cavedogs" pot: $100/head, pays $400/$200/$100 to 1st/2nd/3rd
  at season's end - NOT winner-take-all
- Week 0 was test/setup data - permanently excluded from all pot and
  leaderboard math. Week 1 is the real start of the season.
- Players can browse and select picks ahead on future weeks, but **locking
  is blocked until that week is actually current** (prevents locking a
  thin, barely-populated line a month out)

## Architecture

- `lib/lock.ts` - single source of truth for Central-time week boundaries
  (Tuesday midnight CT) and per-game auto-lock timing. `lib/currentWeek.ts`
  derives week numbers from this, never do date math independently elsewhere.
- `lib/scoring.ts` - grades a single pick (spread/total/dog) given a
  finished game's score. Pure function, no DB access.
- `lib/espnScores.ts` - team name matching between The Odds API and ESPN
  (two vendors, no shared IDs). Uses word-overlap matching, see Gotchas.
- `lib/pot.ts` - constants only (WEEKLY_BUYIN, DOG_BUYIN, DOG_PAYOUTS). The
  actual pot/standings math lives inline in `app/standings/page.tsx`,
  computed fresh on every page load - there is no persisted "pot" table.
- Three separate code paths can lock a pick, and must stay consistent on
  every field (`lockedLine`, `lockedOdds`, `dogSpreadValue`):
  1. `app/pick/[slug]/actions.ts` `lockValue()` - the manual Lock In button
  2. `app/api/auto-lock-sweep/route.ts` - cron, force-locks anything past
     the 30-min deadline using the last cached snapshot
  3. `app/api/grade-results/route.ts` - safety net, force-locks any
     straggler right before grading
- Automation is scheduled via **cron-job.org** (18 jobs across 3 endpoints,
  2 intentionally disabled; API key lives in the cron-job.org account, not
  in this repo), not Render
  cron or GitHub Actions - GitHub's `schedule:` trigger turned out to be
  wildly unreliable in practice (fired ~1/16th as often as configured) and
  was dropped. `.github/workflows/*.yml` still exist for `workflow_dispatch`
  (manual runs from the Actions tab) but have no schedule trigger anymore.
  - The three endpoints are scheduled on **distinct minutes so they never
    hit the server in the same minute** - two cold-start route handlers at
    once will OOM Render's 512MB free instance and it returns 502/503 for
    an hour+ until it stabilises. This actually happened (Sep 1-2 2026)
    right after the GitHub->cron-job.org move put everything on `:00`.
    Current split: auto-lock-sweep `:05/:20/:35/:50`, grade-results
    `:15/:45`, pull-odds `:25`. Keep new jobs off those collision minutes.
  - pull-odds: 12 jobs replicating the tuned weekly pattern (tuned to stay
    under 500 odds-API credits/month), all firing at `hh:25`
  - auto-lock-sweep: every 15 min, 9am-11:50pm (one job). Two helper jobs
    for the midnight and 7:30am edges are kept but **disabled** (`[off]`
    prefix) - nothing kicks off before ~10am CT or after ~11pm CT, so they
    only cost wake-ups.
  - grade-results: every 30 min - core 11am-11:45pm, plus a single 7:30am
    run and a 12:15/12:45am run for late West-coast finishers
  - Both DB-heavy routes cap games processed per invocation
    (`MAX_GAMES_PER_RUN`) so a backlog can't spike memory; the next run
    picks up any overflow.
  - Jobs run roughly **8am-12:45am Central** (not 24/7) - Render's free
    plan caps a workspace at 750 instance-hours/month shared across every
    free service in that Render account, and pinging around the clock would
    keep the service permanently awake and risk exhausting that pool
    (which suspends ALL free services on the account, not just this one).
    The overnight gap lets it sleep; a visit during that window just eats
    one ~30-60s cold-start.
  - All jobs hit plain GET API routes on the live site, timezone
    `America/Chicago` (DST handled natively by cron-job.org, unlike raw
    UTC cron strings).
- `/admin` is password-gated (`ADMIN_PASSWORD` env var) - lets the owner
  void postponed/cancelled games and manually correct scores.

## Gotchas (all found the hard way - don't reintroduce these)

- **Next.js caches `fetch()` by default.** Every external API call
  (ESPN, The Odds API) must pass `{ cache: "no-store" }` or you'll silently
  serve a stale response from hours earlier. This exact bug cost real
  debugging time on grading once.
- **API routes need `export const dynamic = "force-dynamic"`.** Without
  it, Next.js can statically cache an entire route's response and replay
  the same frozen output forever, never re-running the code. All routes
  in `app/api/` have this - keep it on any new one.
- **JSX text content does not interpret `\uXXXX` escapes.** `<div>foo \u2014
  bar</div>` renders the literal text `\u2014`, not an em-dash. Only works
  inside an actual string/template literal: `{`foo \u2014 bar`}`. Hit this
  bug three separate times before it stuck.
- **Timezone: always use `America/Chicago` explicitly via
  `Intl.DateTimeFormat`, never plain `Date` methods.** Render's server runs
  in UTC. Plain `.getDay()`/`.setHours()` etc. silently operate in UTC and
  will compute the wrong wall-clock boundary (week rollover was off by
  ~5 hours before this was fixed).
- **Team matching must use word-overlap, not substring containment.**
  Plain `a.includes(b)` lets short names wrongly match longer, unrelated
  ones sharing a prefix (`"Arkansas"` matching inside `"Arkansas Pine
  Bluff Golden Lions"`, `"Albany"` matching the entirely different school
  `"Albany State"`). `bestNameMatch()` in `lib/espnScores.ts` requires
  every word of a candidate to appear as a whole word in the odds-API
  name before it counts - don't revert to simpler substring logic.
- **A destructive action must never be reachable by a plain `GET` with no
  confirmation.** Link-preview bots in messaging apps (iMessage, Discord,
  Slack) auto-fetch any URL that gets pasted, which will silently trigger
  it. `wipe-week-zero` requires `?confirm=yes-wipe-week-0` for this reason
  - follow the same pattern for any future destructive endpoint.
- **`str_replace`-style multi-step edits risk duplicating content** if an
  edit only replaces part of a block (e.g. a function signature) without
  removing stale content above/below it that got left behind. Always
  verify parens/braces are balanced after editing a file, and grep for
  duplicate top-level `function`/`const`/`import` declarations before
  calling a file done.
- **Odds API responses include the whole season, not just the current
  week.** Each game must be assigned to the week matching *its own*
  kickoff date (`getOrCreateWeekForDate()`), never to whatever week is
  merely "current" at pull time - otherwise a game whose line posts early
  gets permanently filed under the wrong week.
- **The Odds API's `/odds` endpoint also returns live/in-play games with
  in-play lines** (any event whose `commence_time` has passed) - there's no
  param to exclude them. `pullOdds()` filters to `commenceTime > now` before
  ever writing an `OddsSnapshot`, and it's the only writer of that table -
  don't remove that filter or add another write path without it. Otherwise
  a pick whose auto-lock sweep gets missed (an outage, say) could get
  force-locked or graded against a mid-game line that already reflects the
  score, not the market. `latestPreKickoffSnapshot()` in `lib/lock.ts` is
  the defense-in-depth on the read side (auto-lock-sweep and grade-results'
  straggler force-lock both use it instead of "just take the newest
  snapshot") - keep using it in any new code that force-locks from a cached
  snapshot. `/api/debug-live-line-audit` checks both ends.
- **Spread line-movement arrows: never use raw `now - open`.** A favorite
  going `-9.5 -> -7.5` has gotten *smaller* (▼) but subtracts to `+2` (▲).
  Use `spreadMove(now, open)` in `lib/format.ts` - direction from
  `|now| - |open|`, magnitude from the real `|now - open|` so a cross-zero
  flip like `-2 -> +2` still reads as 4, not a vanished chip. Totals are
  fine with plain `now - open` (always positive, far from zero).
- **Never schedule two cron endpoints on the same minute.** Render's free
  512MB instance OOMs when two cold-start Next.js route handlers run at
  once, then serves 502/503 for an hour+ while it thrashes. Symptom looks
  like "cron-job.org is broken" but the job history shows fast 502/503
  from Render, not timeouts. Keep the minute split documented in
  Architecture. Also: `snapshotType` on OddsSnapshot is just a label
  (always `"market"`); grading uses the newest snapshot regardless, so
  don't build logic that branches on it.
