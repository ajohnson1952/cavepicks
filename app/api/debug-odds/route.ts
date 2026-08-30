// app/api/debug-odds/route.ts
// Visit /api/debug-odds?week=1 to see, for every game in that week, how many
// odds snapshots exist and whether the latest one actually has real numbers.
// Add &live=1 to also hit The Odds API right now and compare - this tells you
// whether a game with no line is (a) not being returned by the API at all,
// (b) returned but with no DraftKings spread/total posted yet, or (c) split
// into a separate row by an event-id / name mismatch.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchDraftKingsOdds } from "@/lib/oddsApi";
import { getWeekNumberForDate } from "@/lib/currentWeek";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const weekNumber = Number(searchParams.get("week") ?? "1");
  const includeLive = searchParams.get("live") === "1";

  const week = await prisma.week.findFirst({ where: { seasonYear: 2026, weekNumber } });
  if (!week) return NextResponse.json({ ok: false, error: `No week ${weekNumber}` }, { status: 404 });

  const games = await prisma.game.findMany({
    where: { weekId: week.id },
    include: { oddsSnapshots: { orderBy: { capturedAt: "asc" } } },
    orderBy: { commenceTime: "asc" },
  });

  const rows = games.map((g) => {
    const latest = g.oddsSnapshots[g.oddsSnapshots.length - 1] ?? null;
    // Same gate the pick sheet uses to decide "Odds not posted yet"
    const showsAsPosted =
      !!latest && latest.spreadHome != null && latest.spreadAway != null && latest.total != null;
    return {
      matchup: `${g.awayTeam} @ ${g.homeTeam}`,
      commenceTime: g.commenceTime.toISOString(),
      oddsApiEventId: g.oddsApiEventId,
      snapshotCount: g.oddsSnapshots.length,
      snapshotTypes: Array.from(new Set(g.oddsSnapshots.map((s) => s.snapshotType))),
      latest: latest && {
        spreadHome: latest.spreadHome,
        spreadAway: latest.spreadAway,
        total: latest.total,
        mlHome: latest.mlHome,
        mlAway: latest.mlAway,
        capturedAt: latest.capturedAt.toISOString(),
      },
      showsAsPosted,
    };
  });

  const summary = {
    totalGames: rows.length,
    showsAsPosted: rows.filter((r) => r.showsAsPosted).length,
    showsAsNotPosted: rows.filter((r) => !r.showsAsPosted).length,
    hasSomeOddsButHidden: rows.filter(
      (r) => !r.showsAsPosted && !!r.latest && (r.latest.spreadHome != null || r.latest.total != null || r.latest.mlHome != null)
    ).map((r) => r.matchup),
    noSnapshotAtAll: rows.filter((r) => r.snapshotCount === 0).map((r) => r.matchup),
  };

  let live: unknown = undefined;
  if (includeLive) {
    const apiGames = await fetchDraftKingsOdds();
    const inThisWeek = apiGames.filter(
      (ag) => getWeekNumberForDate(new Date(ag.commenceTime)) === weekNumber
    );
    const dbEventIds = new Set(games.map((g) => g.oddsApiEventId));
    live = {
      apiGamesTotalReturned: apiGames.length,
      apiGamesInThisWeek: inThisWeek.length,
      apiGamesInWeekWithNoSpreadOrTotal: inThisWeek
        .filter((ag) => ag.spreadHome == null && ag.total == null)
        .map((ag) => `${ag.awayTeam} @ ${ag.homeTeam}`),
      apiGamesInWeekNotInDb: inThisWeek
        .filter((ag) => !dbEventIds.has(ag.id))
        .map((ag) => `${ag.awayTeam} @ ${ag.homeTeam}`),
    };
  }

  return NextResponse.json({ ok: true, weekNumber, summary, live, rows });
}
