// app/api/debug-weeks/route.ts
// Shows every Week row and how much data is attached to it - use this to
// confirm whether older data actually got deleted, or is just hidden
// because the app rolled into a new "current" week.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const weeks = await prisma.week.findMany({ orderBy: [{ seasonYear: "asc" }, { weekNumber: "asc" }] });

  const results = [];
  for (const w of weeks) {
    const gameCount = await prisma.game.count({ where: { weekId: w.id } });
    const pickCount = await prisma.pick.count({ where: { weekId: w.id } });
    const lockedPickCount = await prisma.pick.count({ where: { weekId: w.id, locked: true } });
    results.push({
      seasonYear: w.seasonYear,
      weekNumber: w.weekNumber,
      weekId: w.id,
      games: gameCount,
      picks: pickCount,
      lockedPicks: lockedPickCount,
    });
  }

  return NextResponse.json({ ok: true, serverNow: new Date().toISOString(), weeks: results });
}
