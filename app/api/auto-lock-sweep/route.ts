// app/api/auto-lock-sweep/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isPastAutoLock, getCurrentWeekBounds } from "@/lib/lock";

export async function GET() {
  const week = await prisma.week.findUnique({
    where: { seasonYear_weekNumber: { seasonYear: 2026, weekNumber: 1 } },
  });
  if (!week) return NextResponse.json({ ok: true, lockedCount: 0, note: "no active week" });

  const { start, end } = getCurrentWeekBounds();
  const games = await prisma.game.findMany({
    where: { weekId: week.id, commenceTime: { gte: start, lte: end } },
    include: { oddsSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
  });

  let lockedCount = 0;

  for (const game of games) {
    if (!isPastAutoLock(game.commenceTime)) continue;
    const snap = game.oddsSnapshots[0];
    if (!snap) continue;

    const unlockedPicks = await prisma.pick.findMany({
      where: { gameId: game.id, locked: false },
    });

    for (const pick of unlockedPicks) {
      const data: {
        locked: boolean;
        lockedAt: Date;
        lockedLine?: number | null;
        dogSpreadValue?: number | null;
      } = { locked: true, lockedAt: new Date() };

      if (pick.pickType === "SPREAD") {
        data.lockedLine = pick.selection === game.homeTeam ? snap.spreadHome : snap.spreadAway;
      } else if (pick.pickType === "TOTAL") {
        data.lockedLine = snap.total;
      } else if (pick.pickType === "DOG") {
        data.dogSpreadValue =
          pick.selection === game.homeTeam
            ? Math.abs(snap.spreadHome ?? 0)
            : Math.abs(snap.spreadAway ?? 0);
      }

      await prisma.pick.update({ where: { id: pick.id }, data });
      lockedCount++;
    }
  }

  return NextResponse.json({ ok: true, lockedCount });
}
