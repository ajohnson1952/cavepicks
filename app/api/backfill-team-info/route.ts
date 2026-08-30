// app/api/backfill-team-info/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchEspnTeams, findEspnTeamInfo } from "@/lib/espnTeams";
import { fetchEspnScoreboard, teamNamesMatch, toYyyymmdd, EspnResult } from "@/lib/espnScores";

// Games whose kickoff has passed drop out of the live odds feed entirely, so
// the normal pull-and-enrich loop never revisits them. This walks every game
// still missing an abbreviation or broadcast and fixes it directly. Safe to
// re-run anytime - it only touches games missing data.
export async function GET() {
  const espnTeams = await fetchEspnTeams();

  const games = await prisma.game.findMany({
    where: { OR: [{ homeAbbr: null }, { awayAbbr: null }, { broadcast: null }] },
  });

  const dates = new Set(games.map((g) => toYyyymmdd(g.commenceTime)));
  const scoreboardResults: EspnResult[] = [];
  for (const d of dates) {
    scoreboardResults.push(...(await fetchEspnScoreboard(d)));
  }

  let updated = 0;
  const stillUnmatched: string[] = [];

  for (const game of games) {
    const homeInfo = findEspnTeamInfo(game.homeTeam, espnTeams);
    const awayInfo = findEspnTeamInfo(game.awayTeam, espnTeams);
    const scoreboardMatch = scoreboardResults.find(
      (r) => teamNamesMatch(game.homeTeam, r.homeTeam) && teamNamesMatch(game.awayTeam, r.awayTeam)
    );
    const broadcast = scoreboardMatch?.broadcast ?? null;

    if (!homeInfo) stillUnmatched.push(game.homeTeam);
    if (!awayInfo) stillUnmatched.push(game.awayTeam);
    if (!homeInfo && !awayInfo && !broadcast) continue;

    await prisma.game.update({
      where: { id: game.id },
      data: {
        ...(homeInfo && { homeAbbr: homeInfo.abbreviation, homeLogo: homeInfo.logo }),
        ...(awayInfo && { awayAbbr: awayInfo.abbreviation, awayLogo: awayInfo.logo }),
        ...(broadcast && { broadcast }),
      },
    });
    updated++;
  }

  return NextResponse.json({
    ok: true,
    gamesChecked: games.length,
    gamesUpdated: updated,
    stillUnmatched: Array.from(new Set(stillUnmatched)),
  });
}
