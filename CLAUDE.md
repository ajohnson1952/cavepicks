# Cavepicks

Private college football pick'em site for 7 friends. Next.js 16 (App Router)
+ Prisma + Neon Postgres, hosted on Vercel, deployed via GitHub. (Moved off
Render's free tier in Sep 2026 - Render's sleep/cold-start behavior was the
root cause of several cron-timeout incidents; Vercel's serverless functions
get a 300s timeout even on the free Hobby plan, and don't share one long-
lived instance the way Render's single container did.)

**The person maintaining this is a coding novice.** No local dev environment.
Claude commits and pushes changes directly to `main` on GitHub; Vercel
auto-deploys from `main`. Keep commit messages to a single clear line and
explain what changed in plain terms when handing back.

Live site: cavepicks.com (Vercel **Hobby/free** plan - see the Vercel Hobby
limits gotcha below). Note: the bare apex `cavepicks.com` 308-redirects to
`www.cavepicks.com`, which is the real canonical host - any script/cron job
hitting API routes should target `www.cavepicks.com` directly to avoid
depending on redirect-following (see `.github/workflows/*.yml` for the
pattern).
Rules page (source of truth for game rules): cavepicks.com/rules
Neon is on the **Free** plan (owner moved back down from the paid Launch
plan on Oct 1 2026 over compute cost). Free has a fixed monthly compute
allowance - if it runs out, the database suspends until the next month and
the whole site stops loading - so anything that wakes the database on a
timer matters. Every query wakes compute for at least the 5-minute
autosuspend window. `app/api/grade-results/route.ts` therefore checks
ESPN's free scoreboard first and skips the DB entirely unless a game is
live or recently kicked off (see the comment there); keep that pattern for
any new scheduled job.

## Commands

- Build: `npm install && npm run build`, where `package.json`'s `build`
  script is `prisma generate && prisma db push && next build` - `db push`
  applies schema changes directly, there is no migrations folder. This is
  Vercel's actual build step (no custom build-command override needed) and
  it runs on *every* deploy Vercel does - fine today since Claude only ever
  pushes straight to `main` and there's no branch/PR workflow, but if that
  ever changes, a preview deploy from a branch would also run `db push`
  against the same production database.
- No local dev server is used day-to-day - changes go straight to GitHub -> Vercel
- `DATABASE_URL` should be Neon's **pooled** (PgBouncer) connection string,
  not the direct one - Vercel functions are short-lived, so pooling matters
  here in a way it didn't on Render's one long-lived process. Prisma talks
  standard Postgres wire protocol either way; this is a connection-string
  choice, not a code change.

## Game rules (don't relitigate these without asking)

- 5 side picks/week (any mix of spread + total, any games, can double up on
  one game) + 1 dog pick (moneyline pick on an underdog)
- Dog pick pays points = the spread magnitude it was getting, only if it
  wins outright. 0 if it loses. No push.
- **No auto-lock.** A player must hit "Lock In" on each pick themselves.
  The lock window closes **30 minutes before that specific game's own
  kickoff** (per-game, not per-week). A pick still unlocked at that point
  **does not count** - it is left ungraded (not a loss, just absent from
  the week). An unlocked pick never has a line recorded against it.
- **Locks are final for players** - there is no player-facing unlock. Only
  the admin can unlock a pick (`adminUnlockPick` in `app/admin/actions.ts`,
  surfaced per game on `/admin`), which also wipes the frozen line and any
  grading so it can be re-locked.
- Manual Lock In freezes **exactly the line/odds shown on screen at the
  moment of the click** - it must never re-fetch a fresher line
  server-side. This was a real bug once (see Gotchas).
- Weekly pot: $25/head, most correct picks that week. A solo winner takes
  the whole pot (buy-ins + any rollover). **Ties (from Week 4 of 2026 on,
  `TIE_SPLIT_START_WEEK`)**: the tied players split half of *that week's*
  buy-ins; the other half rolls. Rolled money is never split - only a solo
  winner collects it. Nobody scoring (0 correct) rolls everything. Payouts
  round DOWN to whole dollars; the leftover cents are the banker's (for
  hosting), not rolled. Weeks 1-3 keep the old full-rollover rule.
  Math: `resolveWeekPot()` in `lib/pot.ts`.
- A week's pot settles once every game with a LOCKED pick is final and
  every game in the week has kicked off (`lib/seasonStats.ts`) - it does not
  wait on unpicked games (one unmatched unpicked game once froze Week 4).
- Settling up is **net** (buy-in comes out of winnings). `/pot` shows each
  player's running balance from Week 4 on (`lib/ledger.ts`), settled by
  `Payment` rows the admin records on `/admin`. Money never moves in-app.
  Buy-ins are charged only for SETTLED weeks - the league settles up after
  each week ends, not in advance.
  The banker (`BANKER_NAME`, currently Johnson) also plays: their row gets an
  automatic offsetting entry so it's always even, and any real Payment rows
  on the banker are ignored. `/pot`'s "Bank check" = pot not yet paid out +
  credits held + rounding - uncollected buy-ins (what the bank should hold).
- Season-long "Cavedogs" pot: $100/head, NOT winner-take-all. 3rd gets
  $100; 1st/2nd get $400/$200 plus an even split of whatever the pot holds
  beyond $700 (`dogPayouts()` in `lib/pot.ts`)
- Week 0 was test/setup data - permanently excluded from all pot and
  leaderboard math. Week 1 is the real start of the season.
- Players can browse and select picks ahead on future weeks, but **locking
  is blocked until that week is actually current** (prevents locking a
  thin, barely-populated line a month out)

## Architecture

- `lib/lock.ts` - single source of truth for Central-time week boundaries
  (Tuesday midnight CT) and the per-game lock deadline
  (`isPastLockDeadline`, 30 min before kickoff). `lib/currentWeek.ts`
  derives week numbers from this, never do date math independently elsewhere.
- `lib/scoring.ts` - grades a single pick (spread/total/dog) given a
  finished game's score. Pure function, no DB access.
- `lib/espnScores.ts` - team name matching between The Odds API and ESPN
  (two vendors, no shared IDs). Uses word-overlap matching, see Gotchas.
- `lib/pot.ts` - constants (WEEKLY_BUYIN, DOG_BUYIN, DOG_PAYOUTS,
  BANKER_NAME, TIE_SPLIT_START_WEEK) plus the pure `resolveWeekPot()`.
  Weekly results are computed fresh on every load in `lib/seasonStats.ts` -
  there is no persisted "pot" table. Only payments are stored (`Payment`).
- **Only one code path locks a pick**: `app/pick/[slug]/actions.ts`
  `lockValue()`, from the manual Lock In button. Nothing force-locks
  anymore - `grade-results` skips any pick that isn't locked, and
  `app/api/auto-lock-sweep/route.ts` is a retired no-op (kept only so old
  cron jobs get a 200; those jobs can be deleted).
- Automation is scheduled via **cron-job.org** (18 jobs across 3 endpoints,
  2 intentionally disabled), not Vercel Cron or GitHub Actions. A read-only
  cron-job.org API key is stored as the `CRONJOB_API_KEY` env var in Vercel
  (not in this repo) so `/admin` can show each job's real next-scheduled-run
  time (`lib/cronJobOrg.ts`, calls `GET api.cron-job.org/jobs` and reads its
  `nextExecution` field - cron-job.org is the actual source of truth for the
  schedule, so this reads it live rather than re-deriving it from the
  pattern described below). If `CRONJOB_API_KEY` is unset or the call fails,
  the next-run line just doesn't render - it never breaks the rest of
  `/admin`. Vercel Cron was
  considered but the free Hobby plan only allows once-a-day schedules, far
  too coarse for grade-results/pull-odds - so cron-job.org stays regardless
  of host. GitHub's `schedule:` trigger was tried before that and turned
  out to be wildly unreliable in practice (fired ~1/16th as often as
  configured), which is why it was dropped in favor of cron-job.org in the
  first place. `.github/workflows/*.yml` still exist for `workflow_dispatch`
  (manual runs from the Actions tab) but have no schedule trigger.
  - pull-odds: 12 jobs replicating the tuned weekly pattern (tuned to stay
    under 500 odds-API credits/month), all firing at `hh:25`
  - auto-lock-sweep: **retired** (no auto-lock anymore). The cron jobs that
    hit it (one active, two `[off]`) can be deleted; the route is a no-op.
  - grade-results: every 30 min - core 11am-11:45pm, plus a single 7:30am
    run and a 12:15/12:45am run for late West-coast finishers. Most of
    those runs now return `skipped: true` without touching the DB (ESPN
    gate); the 7:30am run always does the full check.
  - Both DB-heavy routes cap games processed per invocation
    (`MAX_GAMES_PER_RUN`) so a backlog can't spike memory; the next run
    picks up any overflow.
  - Jobs run roughly 8am-12:45am Central, though that schedule was tuned
    around Render's free-tier constraints (avoiding its 750-instance-hour
    cap, and its cold-start delay) that don't apply on Vercel - each
    invocation is an isolated serverless function, not one shared
    long-lived container, and pricing is usage-based rather than a shared
    instance-hour pool. No urgent need to widen the overnight gap, but no
    reason it has to stay that way either.
  - All jobs hit plain GET API routes on the live site, timezone
    `America/Chicago` (DST handled natively by cron-job.org, unlike raw
    UTC cron strings).
- `/admin` is password-gated (`ADMIN_PASSWORD` env var) - lets the owner
  void postponed/cancelled games, manually correct scores, unlock a
  player's locked pick, manually trigger grade-results/pull-odds (see
  below), and look up every player's personal pick link ("Player links"
  card - each player's "My Picks" nav shortcut is saved via `localStorage`
  in `app/Nav.tsx`, which is tied to the domain; anyone who bookmarked it
  before the Render->Vercel domain move needs to re-open their link once
  on the new domain for that shortcut to come back).
- **Vercel Web Analytics** is wired in (`@vercel/analytics` package,
  `<Analytics />` in `app/layout.tsx`) - but the package alone only does
  the client-side half. It also has to be turned on in the Vercel
  dashboard (Project -> Analytics -> Enable) for data to actually collect;
  that's a dashboard-only toggle, nothing in this repo controls it.
- **Background jobs and `JobRun`**: `lib/gradeResults.ts` (`runGradeResults`)
  and `lib/pullOdds.ts` (`pullOdds`) hold the actual grading/odds-pull logic;
  both the cron-facing API routes (`app/api/grade-results`,
  `app/api/pull-odds`) and the admin "Run now" buttons
  (`runGradeResultsNow`/`runPullOddsNow` in `app/admin/actions.ts`) call the
  same functions - the routes are just a thin HTTP wrapper cron-job.org hits.
  Every run (cron or manual) upserts one row per job in the `JobRun` table
  (`lib/jobRun.ts`) recording when it last ran, which trigger fired it, and
  a one-line summary - `/admin` reads this to show "last ran: ... CT ·
  auto|manual · <summary>" next to each button. It's one row per job, not a
  log - see the model comment in `schema.prisma`.
- **`/history`**: career/all-time leaderboards plus a table per past season.
  `lib/seasonStats.ts` (`computeCurrentSeasonStats`) holds the live-season
  stat computation shared by `/standings` and `/history` - extracted so both
  pages compute this season's numbers identically instead of duplicating
  the Pick/Game filtering logic. Seasons before this app existed have no
  real Game/Pick rows, so they're entered by hand as one row per
  user/season in `HistoricalSeasonRecord` (summarized W-L-P/points, not
  pick-by-pick - see the model comment in `schema.prisma`) - `/history`
  sums those rows together with the live current season's numbers for the
  all-time tables. `CURRENT_SEASON_YEAR` is hardcoded in
  `app/history/page.tsx` (matching the `seasonYear: 2026` hardcoded
  elsewhere) - bump it, and add that season's users to
  `HistoricalSeasonRecord`, when a season ends and the next one starts.

- **Branding / home-screen app**: the caveman logo's source is
  `design/caveman-logo.svg` (link-preview card: `design/og-card.svg`). The
  PNGs Next serves (`app/icon.png`, `app/apple-icon.png`,
  `app/opengraph-image.png`, `public/icon-*.png`) are rendered from those
  with `sharp` (already in node_modules) - re-render them if the SVG changes.
  `app/manifest.ts` + `appleWebApp` metadata make "Add to Home Screen" open
  it like an app. **A home-screen app has its own localStorage, separate
  from Safari's**, so players should add it *from their own /pick/<slug>
  link* - the manifest deliberately has no `start_url` so it opens to the
  page it was added from.
- **Saturday auto-refresh** on /watch and /guide (`app/watch/RefreshButton.tsx`):
  every 90s, only on Saturdays CT, only while a picked game is live or
  kicking off within 15 min (`hasActiveGame` in `lib/watchData.ts`), only
  while the tab is visible. Cheap on purpose - it's DB reads + free ESPN
  calls, never The Odds API.

- **Pull-to-refresh** (`app/PullToRefresh.tsx`, wraps everything in
  `layout.tsx`): custom, only active in the iOS home-screen app (Safari has
  its own). Uses `router.refresh()`, not a reload. It sets a CSS transform on
  the page wrapper while pulling - never leave a transform/`will-change` on
  `.ptr-content` at rest, or every `position: fixed` element inside it (the
  /guide modal) gets positioned relative to the wrapper instead of the
  screen. Add `data-no-ptr` to any overlay that should ignore the gesture.
  Its document `touchmove` listener MUST be passive - a blocking one made
  every scroll on the site wait on JS ("sticky" scrolling). It doesn't need
  preventDefault: `html.ptr-enabled` turns off iOS's bounce, so a pull at
  the top has nothing to scroll.
- **Haptics**: iOS web has NO haptics API and ignores every programmatic
  trick (script-clicking a hidden `<input type="checkbox" switch>` is
  silent - confirmed on a real iPhone, iOS 18.7 standalone, and the same
  finding in the owner's other project, the-yahngorithm). The only thing
  that ticks is a real finger toggling a switch. So every tappable control
  that should tick is an `app/HapticButton.tsx`: a `<label>` styled like the
  button, with an invisible switch stretched over it. One tick per real tap
  - no multi-tick patterns, nothing mid-drag or after an `await` on iOS.
  `lib/haptics.ts` is Android-only (`navigator.vibrate`) patterns.
  HapticButton ignores touches that move >10px or that stop a momentum
  scroll (switches don't self-cancel on scroll like buttons do) - but it
  must never disable the switch mid-touch; that made iOS eat the gesture.
  **Never put HapticButton on big targets that tile a scrolling area** (pick
  pills, /guide game bars): a quick flick that starts on an iOS switch is
  swallowed as a switch-drag, so the list won't fling. A/B tested on /lab's
  flick test - plain buttons smooth, switch-covered ones dead. Keep ticks on
  small controls and HoldToLock; pick selection uses plain buttons.
- **Pick page interactions**: tap a selected side again to unselect it
  (deletes the unlocked pick - there's no separate "clear" button). Locking
  is hold-to-lock (`app/HoldToLock.tsx`): hold until the meter fills, then
  release; moving or letting go early cancels. Hold length must stay under
  iOS's ~0.5s long-press cutoff or the release never ticks (0.5s+ failed; 0.4s is the tested sweet spot). On iOS the tick/lock happen
  on release (the only moment a switch can tick); there's a touch-end
  fallback so a full hold always locks even if the change event is lost.
  Use TOUCH events for this, not pointer events - iOS doesn't deliver
  pointer events to the switch under the finger (tried; the meter never
  filled). A change event without a completed hold must never lock.

- **Yahngorithm cross-links** (`lib/yahn.ts`): the owner's other site,
  the-yahngorithm.com, is a college football model. It publishes a read-only
  feed (`/api/feed?week=N`: each game's page URL there, the exact Odds API
  team names, and the model's picks). Games match on `Game.homeTeam` /
  `awayTeam`, which hold those same Odds API names - no shared ids. Three
  things use it: (1) Joe's face (`public/yahn-joe.png`) in the corner of
  every game card on the pick sheet links to that game on the yahngorithm;
  (2) a small Joe + edge in the corner of a pick pill marks the side the
  model picked - `SHOW_YAHN_MARKS` in `lib/yahn.ts` is the one switch to
  hide those from everyone; (3) `/yahn` ("Yahn's Picks", a sub-tab under
  Board) lists the model's picks for the week. The feed fetch is
  deliberately cached 15 min (the one external call here that is NOT
  no-store), never touches this app's database, is only made for the
  current week, and returns null on any failure so the Joe extras just
  don't render. Planned next, not built: Yahn as a "ghost player" in the
  standings (its own table, never a real User - keep it out of all pot /
  ledger math). `/lab` still has the original mockups.

## Gotchas (all found the hard way - don't reintroduce these)

- **`cookies()`, `params`, and `searchParams` are all async (Next.js 16).**
  Every one of them must be `await`ed - `await cookies()`, `const { slug } =
  await params`, `const sp = await searchParams`. This project upgraded
  from 14.2.5 straight to 16.3.5 (Sep 2026, via `@next/codemod`) specifically
  to close a batch of Next.js security advisories that had no fix within
  the 14.x line - `npm audit` went from ~35 flagged advisories down to 0.
  React is on 19.3.0 to match. No ESLint in this project (removed the
  codemod's auto-added `eslint`/`eslint-config-next` - never used here,
  `tsc --noEmit` is the only check that runs).

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
  `Intl.DateTimeFormat`, never plain `Date` methods.** The server runs
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
  the pick page's live pill prices (and anything else reading the newest
  snapshot) would show a number that's really the game's score baked into a
  live line. `/api/debug-live-line-audit` flags any snapshot ever captured
  after kickoff. That said, the `commenceTime > now` filter only gates the
  `OddsSnapshot` write - `pullOdds()` still updates every game's
  homeAbbr/awayAbbr/homeLogo/broadcast (via ESPN name-matching) even after
  kickoff, on every pull. Team identity carries none of the live-line risk,
  and gating it too meant a bad ESPN match on a game's first-ever pull (e.g.
  a team ESPN's `/teams` directory hadn't added yet) froze a wrong
  abbr/logo permanently the moment the game started, since a started game
  was never touched again. Real incident: West Georgia and San Jose State
  briefly showed the wrong team abbreviation this way (Sep 2026).
- **Line movement on pick pills is shown as VALUE vs the opener, per side**
  (`valueVsOpen()` in PickForm): green `+2.5` = a better number for that
  pick than the opening line, red = worse, plus a gray "open X" note. For a
  spread that IS the raw signed `now - open` for that side (+10 -> +12.5 is
  +2.5 better; -10 -> -12.5 is 2.5 worse); Over wants the total lower, Under
  higher. This replaced up/down arrows that showed the same green arrow on
  both sides of a spread. The note below is about the older arrow style and
  still applies to anything showing "did the spread grow or shrink".
- **Spread line-movement arrows: never use raw `now - open`.** A favorite
  going `-9.5 -> -7.5` has gotten *smaller* (▼) but subtracts to `+2` (▲).
  Use `spreadMove(now, open)` in `lib/format.ts` - direction from
  `|now| - |open|`, magnitude from the real `|now - open|` so a cross-zero
  flip like `-2 -> +2` still reads as 4, not a vanished chip. Totals are
  fine with plain `now - open` (always positive, far from zero).
- **The Odds API can re-issue a rescheduled game under a brand-new
  `oddsApiEventId`** instead of updating the original event's
  `commenceTime` in place. Since `Game.upsert` keys on that id, this creates
  a SECOND `Game` row for the same real-world matchup - the stale one keeps
  its old (wrong) kickoff time and, because ESPN never has a game at that
  phantom time/date, permanently shows up as "unmatched" on every
  grade-results run instead of ever resolving. Real incident: Cal Poly @
  San Jose State's actual kickoff moved a full day later; a duplicate Game
  row appeared with the old time, and a player's already-locked pick was
  stuck on it. Fix lives in `/admin`: each game card shows its raw `id` and
  a "Merge picks in, void this" form (`mergeDuplicateGame` in
  `app/admin/actions.ts`) that moves any picks off the stale row onto the
  correct one, then voids the stale row. If you see the same matchup twice
  on `/admin` with different kickoff times, this is almost certainly why.
  `pullOdds()` also auto-detects and auto-merges this on every pull now
  (same-week, exact team-name match to a game just seen this pull) - see
  `mergedDuplicates` in its return value - but that can only catch it while
  the Odds API still considers the game upcoming; it can't reach back and
  fix an already-past duplicate, since the API stops returning old events
  entirely. `/api/void-duplicate-events?eventIds=...&key=<ADMIN_PASSWORD>`
  is a bulk fixer for past-week duplicates that have no locked picks on
  them; it refuses (and reports) any that do, since those need the real
  merge. Unlike `wipe-week-zero`'s bare confirm-token (that's only a
  link-preview guard, not access control), this writes data, so it
  requires the real admin password as `?key=`.
- **Stale locks from a pull-odds outage**: `/api/debug-cron-history`
  buckets `OddsSnapshot.capturedAt` into distinct pull "runs" so a gap
  where pull-odds wasn't firing (or was failing) is obvious - `JobRun` only
  keeps the latest run per job, not history, so this is the only way to see
  it. `/api/debug-early-locks?week=N` lists every locked pick against how
  long after its game's first-ever posted line it got locked - useful for
  spotting picks locked against a stale/thin line during such a gap.
  `lib/unlockStaleLocks.ts` bulk-unlocks every currently-locked pick in a
  week locked before a cutoff (wipes the frozen line/grading, same as a
  single `adminUnlockPick`) - exposed both as `/admin`'s "Unlock stale
  locks" form and as `/api/fix-stale-locks?week=N&before=ISO&key=
  <ADMIN_PASSWORD>` for running it outside a browser session.
- **Vercel Hobby (free) plan limits worth knowing** (checked against
  Vercel's docs directly, Sep 2026 - don't assume older numbers floating
  around online): function duration is 300s default/max even on Hobby
  (Fluid Compute, on by default) - not the 10s/60s figures a lot of stale
  writeups still quote, and comfortably covers this app's actual ~1-12s
  runs. Native Vercel Cron is capped at once/day on Hobby, which is why
  cron-job.org stays regardless of host (see Architecture). **Runtime log
  retention is only 1 hour on Hobby** - if something fails in a way that
  isn't captured by this app's own `JobRun` tracking or a debug endpoint,
  Vercel's own function logs are only available for an hour after it
  happened. **Hobby's terms prohibit commercial use** - broadly defined as
  any deployment tied to anyone's financial gain, explicitly including
  "requesting or processing payment from site visitors." Cavepicks itself
  never processes the $25/$100 buy-ins - money changes hands outside the
  app entirely - so this should be fine, but don't add any in-app payment
  flow without re-checking this.
- **(Historical, Render-only) Two cron endpoints on the same minute used
  to OOM the whole app.** Render's free 512MB instance ran everything in
  one shared long-lived container, so two cold-start route handlers firing
  at once could exhaust it and serve 502/503 for an hour+ while it
  thrashed - this actually happened Sep 1-2 2026. Vercel gives each
  invocation its own isolated serverless function, so this specific
  failure mode shouldn't recur - but it's worth remembering as the
  explanation if "cron-job.org is broken" symptoms ever show up again with
  a different host. `snapshotType` on OddsSnapshot is just a label (always
  `"market"`); grading uses the newest snapshot regardless, so don't build
  logic that branches on it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
