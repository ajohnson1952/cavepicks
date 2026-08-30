// app/api/debug-pot-logic/route.ts
// Replicates the standings page's pot-resolution math for every week, but
// returns every intermediate value instead of just the final answer - use
// this when the standings page's pot/leader results look wrong and you need
// to see exactly why, instead of guessing.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const weeks = await prisma.week.findMany({
    where: { seasonYear: 2026 },
    orderBy: { weekNumber: "asc" },
  });
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const allPicks = await prisma.pick.findMany({ where: { week: { seasonYear: 2026 } } });
  const allGames = await prisma.game.findMany({ where: { week: { seasonYear: 2026 } } });

  const results = [];

  for (const week of weeks) {
    const weekGames = allGames.filter((g) => g.weekId === week.id);
    const finalGames = weekGames.filter((g) => g.isFinal);
    const weekFullyGraded = weekGames.length > 0 && weekGames.every((g) => g.isFinal);

    const weekPicks = allPicks.filter(
      (p) => p.weekId === week.id && (p.pickType === "SPREAD" || p.pickType === "TOTAL")
    );

    const correctByUser = new Map<string, number>();
    for (const u of users) correctByUser.set(u.id, 0);
    for (const p of weekPicks) {
      if (p.isWin) correctByUser.set(p.userId, (correctByUser.get(p.userId) ?? 0) + 1);
    }

    const standings = users.map((u) => ({ name: u.name, correct: correctByUser.get(u.id) ?? 0 }));
    const maxCorrect = standings.length > 0 ? Math.max(...standings.map((s) => s.correct)) : 0;
    const leaders = standings.filter((s) => s.correct === maxCorrect);

    results.push({
      weekNumber: week.weekNumber,
      weekId: week.id,
      totalGames: weekGames.length,
      finalGames: finalGames.length,
      weekFullyGraded,
      totalPicksThisWeek: weekPicks.length,
      gradedPicksThisWeek: weekPicks.filter((p) => p.graded).length,
      standings,
      maxCorrect,
      leaderCount: leaders.length,
      leaderNames: leaders.map((l) => l.name),
      wouldDeclareWinner: weekFullyGraded && leaders.length === 1 && maxCorrect > 0,
    });
  }

  return NextResponse.json({ ok: true, userCount: users.length, weeks: results });
}
