// lib/pullOdds.ts
import { prisma } from "./db";
import { fetchOdds } from "./oddsApi";
import { fetchEspnTeams, findEspnTeamInfo } from "./espnTeams";
import { fetchEspnScoreboard, teamNamesMatch, toYyyymmdd, EspnResult } from "./espnScores";
import { getOrCreateWeekForDate, getWeekNumberForDate } from "./currentWeek";
import { mergeGame } from "./mergeGames";

export async function pullOdds(snapshotType: string = "market") {
  const allGames = await fetchOdds();

  // The Odds API's /odds endpoint returns live/in-play games too - any event
  // whose commence_time is already in the past comes back with in-play lines
  // that move with the score, not a pregame market. Never snapshot those:
  // the pick page shows the newest snapshot as the live pill price, and this
  // is the only write path for OddsSnapshot, so this filter is the one guard.
  // See CLAUDE.md gotchas.
  //
  // Team identity (abbr/logo/broadcast) is a different story though - it
  // carries none of that live-line risk, so it's kept on allGames below
  // rather than this pregame-only list. Otherwise a bad ESPN name-match on a
  // game's very first pull (e.g. a team ESPN's directory hadn't listed yet)
  // would freeze that wrong abbr/logo forever the moment the game kicks off,
  // since a started game is never touched by this function again.
  const now = Date.now();

  const espnTeams = await fetchEspnTeams(); // one call, reused for every game below
  const results = [];
  const unmatchedTeams = new Set<string>();
  const freshGames: { id: string; weekId: string; homeTeam: string; awayTeam: string }[] = [];

  // Fetch broadcast/schedule info for every distinct date in this pull -
  // same scoreboard endpoint grading uses, just for channel info this time.
  const dates = new Set(allGames.map((g) => toYyyymmdd(new Date(g.commenceTime))));
  const scoreboardResults: EspnResult[] = [];
  for (const d of dates) {
    scoreboardResults.push(...(await fetchEspnScoreboard(d)));
  }

  // A pull's ~75-100 games almost always land in only 1-2 distinct weeks,
  // but getOrCreateWeekForDate() hits the DB every call - cache by week
  // number so a pull only ever does that lookup once per distinct week
  // instead of once per game.
  const weekCache = new Map<number, Awaited<ReturnType<typeof getOrCreateWeekForDate>>>();
  async function resolveWeek(commenceTime: Date) {
    const weekNumber = getWeekNumberForDate(commenceTime);
    const cached = weekCache.get(weekNumber);
    if (cached) return cached;
    const week = await getOrCreateWeekForDate(commenceTime);
    weekCache.set(weekNumber, week);
    return week;
  }

  // OddsSnapshot rows are always pure inserts (never updates), so they're
  // collected here and written in one createMany() after the loop instead
  // of one create() per game - previously the single biggest chunk of the
  // ~150-200 sequential DB round trips a full pull was making.
  const pendingSnapshots: {
    gameId: string;
    snapshotType: string;
    spreadHome: number | null;
    spreadAway: number | null;
    spreadHomePrice: number | null;
    spreadAwayPrice: number | null;
    total: number | null;
    totalOverPrice: number | null;
    totalUnderPrice: number | null;
    mlHome: number | null;
    mlAway: number | null;
    favoriteTeam: string | null;
    underdogTeam: string | null;
    sourceBook: string | null;
  }[] = [];

  for (const g of allGames) {
    const homeInfo = findEspnTeamInfo(g.homeTeam, espnTeams);
    const awayInfo = findEspnTeamInfo(g.awayTeam, espnTeams);
    if (!homeInfo) unmatchedTeams.add(g.homeTeam);
    if (!awayInfo) unmatchedTeams.add(g.awayTeam);

    const scoreboardMatch = scoreboardResults.find(
      (r) => teamNamesMatch(g.homeTeam, r.homeTeam) && teamNamesMatch(g.awayTeam, r.awayTeam)
    );
    const broadcast = scoreboardMatch?.broadcast ?? null;

    // Each game lands in the week that matches ITS OWN kickoff date - not
    // whatever week happens to be "current" right now. This matters because
    // the odds API can return next week's games early if lines are already
    // posted, and this also self-corrects any past misfiling on every pull.
    const gameWeek = await resolveWeek(new Date(g.commenceTime));

    const game = await prisma.game.upsert({
      where: { oddsApiEventId: g.id },
      update: {
        weekId: gameWeek.id,
        commenceTime: new Date(g.commenceTime),
        ...(homeInfo && { homeAbbr: homeInfo.abbreviation, homeLogo: homeInfo.logo }),
        ...(awayInfo && { awayAbbr: awayInfo.abbreviation, awayLogo: awayInfo.logo }),
        ...(broadcast && { broadcast }),
      },
      create: {
        weekId: gameWeek.id,
        oddsApiEventId: g.id,
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        homeAbbr: homeInfo?.abbreviation ?? null,
        awayAbbr: awayInfo?.abbreviation ?? null,
        homeLogo: homeInfo?.logo ?? null,
        awayLogo: awayInfo?.logo ?? null,
        broadcast,
        commenceTime: new Date(g.commenceTime),
      },
    });
    freshGames.push({ id: game.id, weekId: game.weekId, homeTeam: game.homeTeam, awayTeam: game.awayTeam });

    // Never snapshot a game that's already kicked off - see the comment atop
    // this function. Team identity/broadcast were already updated above for
    // every game, past or future; only the actual market line is withheld.
    if (new Date(g.commenceTime).getTime() > now) {
      pendingSnapshots.push({
        gameId: game.id,
        snapshotType,
        spreadHome: g.spreadHome,
        spreadAway: g.spreadAway,
        spreadHomePrice: g.spreadHomePrice,
        spreadAwayPrice: g.spreadAwayPrice,
        total: g.total,
        totalOverPrice: g.totalOverPrice,
        totalUnderPrice: g.totalUnderPrice,
        mlHome: g.mlHome,
        mlAway: g.mlAway,
        favoriteTeam: g.favoriteTeam,
        underdogTeam: g.underdogTeam,
        sourceBook: g.sourceBook,
      });

      results.push({
        game: `${g.awayTeam} @ ${g.homeTeam}`,
        week: gameWeek.weekNumber,
        spreadHome: g.spreadHome,
        total: g.total,
        sourceBook: g.sourceBook,
      });
    }
  }

  if (pendingSnapshots.length > 0) {
    await prisma.oddsSnapshot.createMany({ data: pendingSnapshots });
  }

  // The Odds API can reissue a rescheduled/corrected game under a brand-new
  // event id instead of updating the original event's commenceTime in
  // place - see the duplicate-Game-row gotcha in CLAUDE.md. Any OTHER,
  // still-active Game row that exactly matches a game we just saw this
  // pull (same week, same team names) is almost certainly that stale
  // leftover - it'll never appear on ESPN's scoreboard under its old kickoff
  // time, so grade-results would flag it "unmatched" forever. Auto-merge it
  // away instead of waiting for someone to notice on /admin. Only reachable
  // while both rows are still upcoming (the Odds API stops returning an
  // event once its game is a few days old), so this only prevents new
  // occurrences going forward - it can't reach back and fix an already
  // week-old duplicate.
  // One batched query instead of one-per-game (this ran ~75-100 extra
  // sequential round trips per pull otherwise - measured pushing pull-odds
  // well past 10s even warm, right in cron-job.org timeout territory).
  const mergedDuplicates: { from: string; to: string; moved: number; skipped: number }[] = [];
  const touchedWeekIds = Array.from(new Set(freshGames.map((g) => g.weekId)));
  if (touchedWeekIds.length > 0) {
    const candidateGames = await prisma.game.findMany({
      where: { weekId: { in: touchedWeekIds }, voided: false },
    });
    const freshIds = new Set(freshGames.map((g) => g.id));
    for (const fresh of freshGames) {
      const staleCandidates = candidateGames.filter(
        (g) => g.weekId === fresh.weekId && g.homeTeam === fresh.homeTeam && g.awayTeam === fresh.awayTeam && g.id !== fresh.id
      );
      for (const stale of staleCandidates) {
        // Both sides of a still-live duplicate pair pass this filter (each
        // is "stale" relative to the other) - only merge when acting as the
        // fresher/kept side, so a pair isn't merged into itself twice.
        if (freshIds.has(stale.id) && stale.id < fresh.id) continue;
        const mergeResult = await mergeGame(
          stale.id,
          fresh.id,
          `Duplicate odds-API event, auto-merged into ${fresh.awayTeam} @ ${fresh.homeTeam}`
        );
        mergedDuplicates.push({
          from: `${stale.awayTeam} @ ${stale.homeTeam}`,
          to: `${fresh.awayTeam} @ ${fresh.homeTeam}`,
          moved: mergeResult.moved,
          skipped: mergeResult.skipped,
        });
      }
    }
  }

  const bookCounts: Record<string, number> = {};
  for (const r of results) {
    const key = r.sourceBook ?? "(no line)";
    bookCounts[key] = (bookCounts[key] ?? 0) + 1;
  }

  return {
    results,
    bookCounts,
    unmatchedTeams: Array.from(unmatchedTeams),
    espnTeamsFetched: espnTeams.length,
    mergedDuplicates,
  };
}
