// app/api/debug-early-locks/route.ts
// For spotting picks locked against a game's very first posted line, before
// the market had a chance to firm up (per /rules: "Some lines may not be
// posted by the sportsbook yet that early in the week... they'll fill in as
// the week goes on"). Reports every locked pick's lockedAt against its
// game's first-ever OddsSnapshot time, ordered soonest-after-first-post
// first - the admin decides which (if any) are "too early" and unlocks them
// on /admin; this is read-only and doesn't touch anything.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get("week");

  const week = weekParam
    ? await prisma.week.findFirst({ where: { weekNumber: Number(weekParam), seasonYear: 2026 } })
    : null;
  if (weekParam && !week) {
    return NextResponse.json({ ok: false, error: `No week ${weekParam} found` }, { status: 404 });
  }

  const picks = await prisma.pick.findMany({
    where: { locked: true, ...(week ? { weekId: week.id } : {}) },
    include: { user: true, game: { include: { oddsSnapshots: { orderBy: { capturedAt: "asc" }, take: 1 } } } },
    orderBy: { lockedAt: "asc" },
  });

  const rows = picks.map((p) => {
    const firstSnapshotAt = p.game.oddsSnapshots[0]?.capturedAt ?? null;
    const minutesAfterFirstPost =
      firstSnapshotAt && p.lockedAt ? Math.round((p.lockedAt.getTime() - firstSnapshotAt.getTime()) / 60000) : null;
    return {
      user: p.user.name,
      pickId: p.id,
      game: `${p.game.awayTeam} @ ${p.game.homeTeam}`,
      commenceTime: p.game.commenceTime.toISOString(),
      pickType: p.pickType,
      selection: p.selection,
      lockedLine: p.lockedLine,
      lockedAt: p.lockedAt?.toISOString() ?? null,
      firstLinePostedAt: firstSnapshotAt?.toISOString() ?? null,
      minutesAfterFirstPost,
    };
  });

  return NextResponse.json({
    ok: true,
    weekNumber: week?.weekNumber ?? "all",
    count: rows.length,
    // Soonest-after-first-post first - these are the most likely "locked a
    // thin opener" candidates.
    rows: [...rows].sort((a, b) => (a.minutesAfterFirstPost ?? Infinity) - (b.minutesAfterFirstPost ?? Infinity)),
  });
}
