// lib/unlockStaleLocks.ts
import { prisma } from "./db";
import { UNLOCK_DATA } from "./unlockPick";

// Bulk-unlocks every currently-locked pick in a week whose lockedAt is
// before `cutoff`. For the recurring situation where pull-odds goes quiet
// for a stretch (check /api/debug-cron-history) and players lock picks
// against whatever stale line was still showing, before the next real pull
// refreshes it - those locks are technically valid (the line WAS what was
// on screen) but not what anyone actually wants graded against. Otherwise
// identical to a single adminUnlockPick, just applied to every matching row
// at once.
export async function unlockStaleLocks(weekNumber: number, seasonYear: number, cutoff: Date) {
  const week = await prisma.week.findFirst({ where: { weekNumber, seasonYear } });
  if (!week) return { ok: false as const, error: `No week ${weekNumber} found` };

  const toUnlock = await prisma.pick.findMany({
    where: { weekId: week.id, locked: true, lockedAt: { lt: cutoff } },
    include: { user: true, game: true },
  });

  const result = await prisma.pick.updateMany({
    where: { weekId: week.id, locked: true, lockedAt: { lt: cutoff } },
    data: UNLOCK_DATA,
  });

  return {
    ok: true as const,
    weekNumber,
    cutoff: cutoff.toISOString(),
    unlockedCount: result.count,
    unlocked: toUnlock.map((p) => ({
      user: p.user.name,
      game: `${p.game.awayTeam} @ ${p.game.homeTeam}`,
      pickType: p.pickType,
      selection: p.selection,
      lockedLine: p.lockedLine,
      lockedAt: p.lockedAt?.toISOString() ?? null,
    })),
  };
}
