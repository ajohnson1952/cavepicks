// lib/pullOdds.ts
import { prisma } from "./db";
import { fetchDraftKingsOdds } from "./oddsApi";

export async function pullOdds(snapshotType: "early" | "lock", weekId: string) {
  const games = await fetchDraftKingsOdds();
  const results = [];

  for (const g of games) {
    const game = await prisma.game.upsert({
      where: { oddsApiEventId: g.id },
      update: { commenceTime: new Date(g.commenceTime) },
      create: {
        weekId,
        oddsApiEventId: g.id,
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
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
