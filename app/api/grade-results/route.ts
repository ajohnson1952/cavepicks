// app/api/grade-results/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchEspnScoreboard, teamNamesMatch, toYyyymmdd, EspnResult } from "@/lib/espnScores";
import { gradePick } from "@/lib/scoring";

export async function GET() {
  // Any game that's already kicked off but isn't marked final yet - across
  // ALL weeks, not just "this week". Using each game's own clock instead of
  // week boundaries means a late Monday-night game from last week still gets
  // graded even after the calendar has already rolled into a new week.
  const games = await prisma.game.findMany({
    where: { isFinal: false, commenceTime: { lte: new Date() } },
    include: { oddsSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
  });

  if (games.length === 0) {
    return NextResponse.json({ ok: true, gamesGraded: 0, picksGraded: 0, note: "nothing left to grade" });
  }

  // Only fetch ESPN for the specific dates our ungraded games actually fall on
  const dates = Array.from(new Set(games.map((g) => toYyyymmdd(g.commenceTime))));
  const allResults: EspnResult[] = [];
  for (const d of dates) {
    const results = await fetchEspnScoreboard(d);
    allResults.push(...results);
  }

  let gamesGraded = 0;
  let picksGraded = 0;
  const unmatched: { ourGame: string; date: string; espnGamesThatDay: string[] }[] = [];
  const stillInProgress: string[] = [];

  for (const game of games) {
    const nameMatch = allResults.find(
      (r) => teamNamesMatch(game.homeTeam, r.homeTeam) && teamNamesMatch(game.awayTeam, r.awayTeam)
    );

    if (!nameMatch) {
      const gameDate = toYyyymmdd(game.commenceTime);
      unmatched.push({
        ourGame: `${game.awayTeam} @ ${game.homeTeam}`,
        date: gameDate,
        espnGamesThatDay: allResults
          .filter((r) => toYyyymmdd(new Date(r.dateISO)) === gameDate)
          .map((r) => `${r.awayTeam} @ ${r.homeTeam}${r.completed ? "" : " (not final yet)"}`),
      });
      continue;
    }

    if (!nameMatch.completed) {
      // Found the right game, it just hasn't finished playing - not a problem
      stillInProgress.push(`${game.awayTeam} @ ${game.homeTeam}`);
      continue;
    }

    const match = nameMatch;

    await prisma.game.update({
      where: { id: game.id },
      data: { homeScore: match.homeScore, awayScore: match.awayScore, isFinal: true },
    });
    gamesGraded++;

    const picks = await prisma.pick.findMany({ where: { gameId: game.id } });
    const snap = game.oddsSnapshots[0];

    for (const pick of picks) {
      let lockedLine = pick.lockedLine;
      let dogSpreadValue = pick.dogSpreadValue;

      // Safety net: if a pick somehow never got locked (sweep missed it),
      // force-lock it now using the last cached line before grading.
      if (!pick.locked && snap) {
        if (pick.pickType === "SPREAD") {
          lockedLine = pick.selection === game.homeTeam ? snap.spreadHome : snap.spreadAway;
        } else if (pick.pickType === "TOTAL") {
          lockedLine = snap.total;
        } else if (pick.pickType === "DOG") {
          dogSpreadValue =
            pick.selection === game.homeTeam
              ? Math.abs(snap.spreadHome ?? 0)
              : Math.abs(snap.spreadAway ?? 0);
        }
        await prisma.pick.update({
          where: { id: pick.id },
          data: { locked: true, lockedAt: new Date(), lockedLine, dogSpreadValue },
        });
      }

      const result = gradePick(
        { homeTeam: game.homeTeam, awayTeam: game.awayTeam, homeScore: match.homeScore, awayScore: match.awayScore },
        { pickType: pick.pickType, selection: pick.selection, lockedLine, dogSpreadValue }
      );

      await prisma.pick.update({
        where: { id: pick.id },
        data: {
          graded: true,
          isWin: result.isWin,
          isPush: result.isPush,
          pointsEarned: result.pointsEarned,
        },
      });
      picksGraded++;
    }
  }

  return NextResponse.json({ ok: true, gamesGraded, picksGraded, stillInProgress, unmatched });
}
