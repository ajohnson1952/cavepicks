"use server";

import { prisma } from "@/lib/db";
import { isPastLockDeadline } from "@/lib/lock";
import { getWeekNumberForDate } from "@/lib/currentWeek";
import { revalidatePath } from "next/cache";

// Deletes an unlocked pick entirely, since radio buttons can't be "unselected"
// on their own. Locked picks can't be cleared by a player - the lock is
// final (only the admin can unlock).
export async function clearPick(slug: string, gameId: string, pickType: "SPREAD" | "TOTAL" | "DOG") {
  const user = await prisma.user.findUnique({ where: { pickSlug: slug } });
  if (!user) return { error: "Player not found" };

  const pick = await prisma.pick.findFirst({
    where: { userId: user.id, gameId, pickType },
  });
  if (!pick) return { error: null }; // nothing to clear
  if (pick.locked) return { error: "That pick is locked - locks are final. Ask the commissioner to unlock it." };

  await prisma.pick.delete({ where: { id: pick.id } });
  revalidatePath(`/pick/${slug}`);
  revalidatePath("/board");
  return { error: null };
}

// Saves a pick the instant it's selected - unlocked, fully editable still.
// Called directly from the radio's onChange, not via form submission.
export async function autosaveSelection(
  slug: string,
  gameId: string,
  pickType: "SPREAD" | "TOTAL" | "DOG",
  selection: string
) {
  const user = await prisma.user.findUnique({ where: { pickSlug: slug } });
  if (!user) return { error: "Player not found" };

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) return { error: "Game not found" };
  if (isPastLockDeadline(game.commenceTime)) return { error: "The lock window for this game has closed" };

  // The pick belongs to whatever week the GAME is actually in, not
  // whatever week happens to be "current" today - this matters now that
  // players can pick ahead on future weeks' games.
  const weekId = game.weekId;

  const existingPicks = await prisma.pick.findMany({
    where: { userId: user.id, weekId },
    include: { game: true },
  });
  const existingForSlot = existingPicks.find((p) => p.gameId === gameId && p.pickType === pickType);

  if (existingForSlot?.locked) return { error: "Already locked" };

  // A pick that never got locked before its own game's deadline passed is
  // dead weight - it can never count (see lib/lock.ts), so it shouldn't
  // permanently occupy one of the 5 side-pick slots either. Only picks that
  // are locked, or still have a live chance to be locked, count toward the cap.
  const isLive = (p: (typeof existingPicks)[number]) => p.locked || !isPastLockDeadline(p.game.commenceTime);

  if (!existingForSlot) {
    if (pickType === "DOG") {
      if (existingPicks.some((p) => p.pickType === "DOG" && isLive(p))) {
        return { error: "Only one dog pick allowed per week." };
      }
    } else {
      const sideCount = existingPicks.filter(
        (p) => (p.pickType === "SPREAD" || p.pickType === "TOTAL") && isLive(p)
      ).length;
      if (sideCount >= 5) return { error: "You already have 5 side/total picks - clear one first." };
    }
  }

  // Only counts as a "change" (for the Flip-Flopper fun stat) if they'd
  // already picked something different in this slot before - not the
  // first-ever selection.
  const isRealChange = !!existingForSlot && existingForSlot.selection !== selection;

  await prisma.pick.upsert({
    where: { userId_weekId_gameId_pickType: { userId: user.id, weekId, gameId, pickType } },
    update: isRealChange ? { selection, selectionChanges: { increment: 1 } } : { selection },
    create: { userId: user.id, weekId, gameId, pickType, selection },
  });

  revalidatePath(`/pick/${slug}`);
  revalidatePath("/board");
  return { error: null };
}

// Locks a pick using the exact line/odds the player is currently looking
// at on screen - passed in directly rather than fetched fresh from the
// database. This matters: if a background odds pull updates the line while
// someone has the page open, we want Lock In to freeze what they actually
// saw and decided on, not silently swap in a newer number behind their back.
export async function lockValue(
  slug: string,
  gameId: string,
  pickType: "SPREAD" | "TOTAL" | "DOG",
  selection: string,
  lockedLine: number | null,
  lockedOdds: number | null,
  dogSpreadValue: number | null,
  lockedBook: string | null
) {
  const user = await prisma.user.findUnique({ where: { pickSlug: slug } });
  if (!user) return { error: "Player not found" };

  const game = await prisma.game.findUnique({ where: { id: gameId }, include: { week: true } });
  if (!game) return { error: "Game not found" };
  if (isPastLockDeadline(game.commenceTime)) return { error: "The lock window for this game has closed" };
  if (game.week.weekNumber > getWeekNumberForDate()) {
    return { error: "Locking isn't open yet for a future week - come back once it's the current week." };
  }

  // The pick belongs to whatever week the GAME is actually in, not
  // whatever week happens to be "current" today - this matters now that
  // players can pick ahead on future weeks' games.
  const weekId = game.weekId;

  const existingPicks = await prisma.pick.findMany({
    where: { userId: user.id, weekId },
    include: { game: true },
  });
  const existingSlot = existingPicks.find((p) => p.gameId === gameId && p.pickType === pickType);
  const alreadyExists = !!existingSlot;

  // Locks are final - a locked pick can't be re-locked with a new line.
  if (existingSlot?.locked) return { error: "That pick is already locked." };

  // A pick that never got locked before its own game's deadline passed is
  // dead weight - it can never count (see lib/lock.ts), so it shouldn't
  // permanently occupy one of the 5 side-pick slots either. Only picks that
  // are locked, or still have a live chance to be locked, count toward the cap.
  const isLive = (p: (typeof existingPicks)[number]) => p.locked || !isPastLockDeadline(p.game.commenceTime);

  if (!alreadyExists) {
    if (pickType === "DOG") {
      if (existingPicks.some((p) => p.pickType === "DOG" && isLive(p))) {
        return { error: "Only one dog pick allowed per week." };
      }
    } else {
      const sideCount = existingPicks.filter(
        (p) => (p.pickType === "SPREAD" || p.pickType === "TOTAL") && isLive(p)
      ).length;
      if (sideCount >= 5) return { error: "You already have 5 side/total picks - clear one first." };
    }
  }

  const data = {
    selection,
    locked: true,
    lockedAt: new Date(),
    lockedLine,
    lockedOdds,
    dogSpreadValue,
    lockedBook,
  };

  await prisma.pick.upsert({
    where: { userId_weekId_gameId_pickType: { userId: user.id, weekId, gameId, pickType } },
    update: data,
    create: { userId: user.id, weekId, gameId, pickType, ...data },
  });

  revalidatePath(`/pick/${slug}`);
  revalidatePath("/board");
  return { error: null };
}
