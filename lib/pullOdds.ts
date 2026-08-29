// lib/pullOdds.ts
import { prisma } from "./db";
import { fetchDraftKingsOdds } from "./oddsApi";
import { fetchEspnTeams, findEspnTeamInfo } from "./espnTeams";

export async function pullOdds(snapshotType: "early" | "lock", weekId: string) {
  const games = await fetchDraftKingsOdds();
  const espnTeams = await fetchEspnTeams(); // one call, reused for every game below
  const results = [];

  for (const g of games) {
    const homeInfo = findEspnTeamInfo(g.homeTeam, espnTeams);
    const awayInfo = findEspnTeamInfo(g.awayTeam, espnTeams);

    const game = await prisma.game.upsert({
      where: { oddsApiEventId: g.id },
      update: {
        commenceTime: new Date(g.commenceTime),
        // Only fill these in if we don't already have them, or if a match
        // now succeeds where it didn't before - never overwrite good data
        // with a failed lookup.
        ...(homeInfo && { homeAbbr: homeInfo.abbreviation, homeLogo: homeInfo.logo }),
        ...(awayInfo && { awayAbbr: awayInfo.abbreviation, awayLogo: awayInfo.logo }),
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

  return results;
}
