// lib/mergeGames.ts
import { prisma } from "./db";

export type MergeResult = { moved: number; skipped: number; voided: boolean };

// Moves every pick off `fromGameId` onto `toGameId` (skipping - and never
// discarding - any pick that would collide with one already on the target:
// same user/week/pickType), then voids the source game IF everything moved
// cleanly. If anything was skipped, the source is left un-voided so a human
// can look at it rather than anything silently disappearing.
//
// Exists because the Odds API can reissue a rescheduled/corrected game
// under a brand-new event id instead of updating the original in place -
// see the duplicate-Game-row gotcha in CLAUDE.md. Used both by the admin's
// manual "merge" form and by pullOdds()'s own automatic cleanup.
export async function mergeGame(fromGameId: string, toGameId: string, reason: string): Promise<MergeResult> {
  const picks = await prisma.pick.findMany({ where: { gameId: fromGameId } });
  let moved = 0;
  let skipped = 0;
  for (const pick of picks) {
    const conflict = await prisma.pick.findUnique({
      where: {
        userId_weekId_gameId_pickType: {
          userId: pick.userId,
          weekId: pick.weekId,
          gameId: toGameId,
          pickType: pick.pickType,
        },
      },
    });
    if (conflict) {
      skipped++;
      continue;
    }
    await prisma.pick.update({ where: { id: pick.id }, data: { gameId: toGameId } });
    moved++;
  }

  let voided = false;
  if (skipped === 0) {
    await prisma.game.update({ where: { id: fromGameId }, data: { voided: true, voidReason: reason } });
    voided = true;
  }

  return { moved, skipped, voided };
}
