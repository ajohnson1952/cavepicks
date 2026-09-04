// lib/pullOdds.ts
import { prisma } from "./db";
import { fetchOdds } from "./oddsApi";
import { fetchEspnTeams, findEspnTeamInfo } from "./espnTeams";
import { fetchEspnScoreboard, teamNamesMatch, toYyyymmdd, EspnResult } from "./espnScores";
import { getOrCreateWeekForDate } from "./currentWeek";

export async function pullOdds(snapshotType: string = "market") {
  const allGames = await fetchOdds();

  // The Odds API's /odds endpoint returns live/in-play games too - any event
  // whose commence_time is already in the past comes back with in-play lines
  // that reflect the game actually happening (they move with the score), not
  // a pregame market. Never snapshot those: if a pick's auto-lock sweep ever
  // misses its window and grade-results has to force-lock it as a straggler,
  // it must fall back to a genuine pregame line, never a live one - this is
  // the only write path for OddsSnapshot, so filtering here is the one place
  // that needs to guard it. See CLAUDE.md gotchas.
  const now = Date.now();
  const games = allGames.filter((g) => new Date(g.commenceTime).getTime() > now);

  const espnTeams = await fetchEspnTeams(); // one call, reused for every game below
  const results = [];
  const unmatchedTeams = new Set<string>();

  // Fetch broadcast/schedule info for every distinct date in this pull -
  // same scoreboard endpoint grading uses, just for channel info this time.
  const dates = new Set(games.map((g) => toYyyymmdd(new Date(g.commenceTime))));
  const scoreboardResults: EspnResult[] = [];
  for (const d of dates) {
    scoreboardResults.push(...(await fetchEspnScoreboard(d)));
  }

  for (const g of games) {
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
    const gameWeek = await getOrCreateWeekForDate(new Date(g.commenceTime));

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

    await prisma.oddsSnapshot.create({
      data: {
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
      },
    });

    results.push({
      game: `${g.awayTeam} @ ${g.homeTeam}`,
      week: gameWeek.weekNumber,
      spreadHome: g.spreadHome,
      total: g.total,
      sourceBook: g.sourceBook,
    });
  }

  const bookCounts: Record<string, number> = {};
  for (const r of results) {
    const key = r.sourceBook ?? "(no line)";
    bookCounts[key] = (bookCounts[key] ?? 0) + 1;
  }

  return { results, bookCounts, unmatchedTeams: Array.from(unmatchedTeams), espnTeamsFetched: espnTeams.length };
}
