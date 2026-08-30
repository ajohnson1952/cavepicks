// lib/pullOdds.ts
import { prisma } from "./db";
import { fetchDraftKingsOdds } from "./oddsApi";
import { fetchEspnTeams, findEspnTeamInfo } from "./espnTeams";
import { fetchEspnScoreboard, teamNamesMatch, toYyyymmdd, EspnResult } from "./espnScores";

export async function pullOdds(snapshotType: "early" | "lock", weekId: string) {
  const games = await fetchDraftKingsOdds();
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

    const game = await prisma.game.upsert({
      where: { oddsApiEventId: g.id },
      update: {
        commenceTime: new Date(g.commenceTime),
        ...(homeInfo && { homeAbbr: homeInfo.abbreviation, homeLogo: homeInfo.logo }),
        ...(awayInfo && { awayAbbr: awayInfo.abbreviation, awayLogo: awayInfo.logo }),
        ...(broadcast && { broadcast }),
      },
      create: {
        weekId,
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
        total: g.total,
        mlHome: g.mlHome,
        mlAway: g.mlAway,
        favoriteTeam: g.favoriteTeam,
        underdogTeam: g.underdogTeam,
      },
    });

    results.push({
      game: `${g.awayTeam} @ ${g.homeTeam}`,
      spreadHome: g.spreadHome,
      total: g.total,
    });
  }

  return { results, unmatchedTeams: Array.from(unmatchedTeams), espnTeamsFetched: espnTeams.length };
}
