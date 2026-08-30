// app/api/wipe-week-zero/route.ts
// Deletes everything tied to Week 0 (the test week) - all Picks, all
// OddsSnapshots, all Games, and the Week row itself. Users are never
// touched. Other weeks are never touched.
//
// SAFETY: requires ?confirm=yes-wipe-week-0 in the URL. This is not real
// security - it's a guard against accidental triggers, since a plain GET
// with no confirmation can be fetched automatically by link-preview bots
// in messaging apps (iMessage, Discord, Slack, etc.) just from the URL
// being pasted somewhere, without anyone actually clicking it.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("confirm") !== "yes-wipe-week-0") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Add ?confirm=yes-wipe-week-0 to this URL to actually run the wipe. This check exists so the wipe can't fire from a link preview or accidental visit.",
      },
      { status: 400 }
    );
  }

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
