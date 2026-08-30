// app/api/auto-lock-sweep/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isPastAutoLock } from "@/lib/lock";

export const dynamic = "force-dynamic";

export async function GET() {
  // Any game not yet final, whose auto-lock window could plausibly have
  // opened - scoped to "kicks off within the next day or already started"
  // rather than "this week", so nothing near a week-boundary gets skipped.
  const games = await prisma.game.findMany({
    where: {
      isFinal: false,
      commenceTime: { lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    },
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
        lockedOdds?: number | null;
        dogSpreadValue?: number | null;
        lockedBook?: string | null;
      } = { locked: true, lockedAt: new Date(), lockedBook: snap.sourceBook };

      if (pick.pickType === "SPREAD") {
        const isHome = pick.selection === game.homeTeam;
        data.lockedLine = isHome ? snap.spreadHome : snap.spreadAway;
        data.lockedOdds = isHome ? snap.spreadHomePrice : snap.spreadAwayPrice;
      } else if (pick.pickType === "TOTAL") {
        data.lockedLine = snap.total;
        data.lockedOdds = pick.selection === "over" ? snap.totalOverPrice : snap.totalUnderPrice;
      } else if (pick.pickType === "DOG") {
        const isHome = pick.selection === game.homeTeam;
        data.dogSpreadValue = Math.abs((isHome ? snap.spreadHome : snap.spreadAway) ?? 0);
        data.lockedOdds = isHome ? snap.mlHome : snap.mlAway;
      }

      await prisma.pick.update({ where: { id: pick.id }, data });
      lockedCount++;
    }
  }

  return NextResponse.json({ ok: true, lockedCount });
}
