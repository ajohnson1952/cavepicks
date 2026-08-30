// app/api/wipe-week-zero/route.ts
// Deletes everything tied to Week 0 (the test week) - all Picks, all
// OddsSnapshots, all Games, and the Week row itself. Users are never
// touched. Other weeks are never touched. Safe to visit more than once;
// a second run just reports 0 deleted since Week 0 will already be gone.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const week = await prisma.week.findUnique({
    where: { seasonYear_weekNumber: { seasonYear: 2026, weekNumber: 0 } },
  });

  if (!week) {
    return NextResponse.json({ ok: true, note: "Week 0 not found - already wiped, or never existed" });
  }

  const games = await prisma.game.findMany({ where: { weekId: week.id } });
  const gameIds = games.map((g) => g.id);

  const picksDeleted = await prisma.pick.deleteMany({ where: { weekId: week.id } });
  const snapshotsDeleted = await prisma.oddsSnapshot.deleteMany({ where: { gameId: { in: gameIds } } });
  const gamesDeleted = await prisma.game.deleteMany({ where: { weekId: week.id } });

  // WeeklyPot for this week, if one was ever created
  await prisma.weeklyPot.deleteMany({ where: { weekId: week.id } }).catch(() => null);

  await prisma.week.delete({ where: { id: week.id } });

  return NextResponse.json({
    ok: true,
    picksDeleted: picksDeleted.count,
    snapshotsDeleted: snapshotsDeleted.count,
    gamesDeleted: gamesDeleted.count,
    weekDeleted: true,
  });
}
