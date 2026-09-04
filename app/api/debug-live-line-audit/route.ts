// app/api/debug-live-line-audit/route.ts
// One-time-and-reusable check for the "graded against a live/in-play line
// instead of the pregame line" bug: reports every OddsSnapshot ever captured
// AFTER its game's kickoff (should be none, going forward - pullOdds() now
// refuses to capture those), and every locked pick whose lockedAt is after
// kickoff, showing what line it actually got locked with vs the last
// genuine pregame snapshot for that game so a mismatch is obvious.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshots = await prisma.oddsSnapshot.findMany({ include: { game: true } });

  const inPlaySnapshots = snapshots
    .filter((s) => s.capturedAt.getTime() > s.game.commenceTime.getTime())
    .map((s) => ({
      game: `${s.game.awayTeam} @ ${s.game.homeTeam}`,
      commenceTime: s.game.commenceTime.toISOString(),
      capturedAt: s.capturedAt.toISOString(),
      minutesAfterKickoff: Math.round((s.capturedAt.getTime() - s.game.commenceTime.getTime()) / 60000),
      spreadHome: s.spreadHome,
      spreadAway: s.spreadAway,
      total: s.total,
    }));

  const lockedPicks = await prisma.pick.findMany({
    where: { locked: true },
    include: { game: true, user: true },
  });

  const lateLocks = lockedPicks.filter(
    (p) => p.lockedAt && p.lockedAt.getTime() > p.game.commenceTime.getTime()
  );

  const flagged = lateLocks.map((p) => {
    const gameSnaps = snapshots
      .filter((s) => s.gameId === p.gameId)
      .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime());
    const preKickoff = gameSnaps.find((s) => s.capturedAt.getTime() <= p.game.commenceTime.getTime()) ?? null;

    let preKickoffLine: number | null = null;
    if (preKickoff) {
      const isHome = p.selection === p.game.homeTeam;
      if (p.pickType === "SPREAD") preKickoffLine = isHome ? preKickoff.spreadHome : preKickoff.spreadAway;
      else if (p.pickType === "TOTAL") preKickoffLine = preKickoff.total;
      else if (p.pickType === "DOG") preKickoffLine = Math.abs((isHome ? preKickoff.spreadHome : preKickoff.spreadAway) ?? 0);
    }

    const usedLine = p.pickType === "DOG" ? p.dogSpreadValue : p.lockedLine;
    const suspect = preKickoffLine != null && usedLine != null && preKickoffLine !== usedLine;

    return {
      user: p.user.name,
      game: `${p.game.awayTeam} @ ${p.game.homeTeam}`,
      pickType: p.pickType,
      selection: p.selection,
      commenceTime: p.game.commenceTime.toISOString(),
      lockedAt: p.lockedAt?.toISOString(),
      minutesAfterKickoff: p.lockedAt
        ? Math.round((p.lockedAt.getTime() - p.game.commenceTime.getTime()) / 60000)
        : null,
      lineUsedToGrade: usedLine,
      lastPregameLine: preKickoffLine,
      suspect, // true = graded/locked value differs from the true pregame line
    };
  });

  return NextResponse.json({
    ok: true,
    summary: {
      totalSnapshots: snapshots.length,
      inPlaySnapshotCount: inPlaySnapshots.length,
      totalLockedPicks: lockedPicks.length,
      lockedAfterKickoffCount: lateLocks.length,
      suspectCount: flagged.filter((f) => f.suspect).length,
      note:
        "lockedAfterKickoff is expected sometimes (grade-results' pre-grading " +
        "safety net force-locks stragglers right before grading, which is after " +
        "kickoff by definition) - 'suspect' is the real signal: it means the " +
        "line actually used differs from the last genuine pregame line.",
    },
    inPlaySnapshots,
    lateLocks: flagged,
  });
}
