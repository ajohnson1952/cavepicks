"use server";

import { prisma } from "@/lib/db";
import { isPastAutoLock } from "@/lib/lock";
import { getWeekNumberForDate } from "@/lib/currentWeek";
import { revalidatePath } from "next/cache";

// Undoes a manual lock - only allowed if the game hasn't hit its 30-min
// auto-lock deadline yet. Past that point, locks are final either way.
export async function unlockPick(slug: string, pickId: string) {
  const user = await prisma.user.findUnique({ where: { pickSlug: slug } });
  if (!user) return { error: "Player not found" };

  const pick = await prisma.pick.findUnique({
    where: { id: pickId },
    include: { game: true },
  });
  if (!pick || pick.userId !== user.id) return { error: "Pick not found" };
  if (!pick.locked) return { error: "Not locked" };
  if (isPastAutoLock(pick.game.commenceTime)) {
    return { error: "Can't unlock - this game already passed its auto-lock deadline" };
  }

  await prisma.pick.update({
    where: { id: pickId },
    data: { locked: false, lockedAt: null, lockedLine: null, lockedOdds: null, dogSpreadValue: null },
  });
  revalidatePath(`/pick/${slug}`);
  revalidatePath("/board");
  return { error: null };
}

// Deletes an unlocked pick entirely, since radio buttons can't be "unselected"
// on their own. Locked picks can't be cleared - unlock first.
export async function clearPick(slug: string, gameId: string, pickType: "SPREAD" | "TOTAL" | "DOG") {
  const user = await prisma.user.findUnique({ where: { pickSlug: slug } });
  if (!user) return { error: "Player not found" };

  const pick = await prisma.pick.findFirst({
    where: { userId: user.id, gameId, pickType },
  });
  if (!pick) return { error: null }; // nothing to clear
  if (pick.locked) return { error: "Can't clear a locked pick - unlock it first" };

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
  if (isPastAutoLock(game.commenceTime)) return { error: "This game already auto-locked" };

  // The pick belongs to whatever week the GAME is actually in, not
  // whatever week happens to be "current" today - this matters now that
  // players can pick ahead on future weeks' games.
  const weekId = game.weekId;

  const existingPicks = await prisma.pick.findMany({ where: { userId: user.id, weekId } });
  const existingForSlot = existingPicks.find((p) => p.gameId === gameId && p.pickType === pickType);

  if (existingForSlot?.locked) return { error: "Already locked" };

  if (!existingForSlot) {
    if (pickType === "DOG") {
      if (existingPicks.some((p) => p.pickType === "DOG")) {
        return { error: "Only one dog pick allowed per week." };
      }
    } else {
      const sideCount = existingPicks.filter((p) => p.pickType === "SPREAD" || p.pickType === "TOTAL").length;
      if (sideCount >= 5) return { error: "You already have 5 side/total picks - clear one first." };
    }
  }

  await prisma.pick.upsert({
    where: { userId_weekId_gameId_pickType: { userId: user.id, weekId, gameId, pickType } },
    update: { selection },
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
  dogSpreadValue: number | null
) {
  const user = await prisma.user.findUnique({ where: { pickSlug: slug } });
  if (!user) return { error: "Player not found" };

  const game = await prisma.game.findUnique({ where: { id: gameId }, include: { week: true } });
  if (!game) return { error: "Game not found" };
  if (isPastAutoLock(game.commenceTime)) return { error: "This game already auto-locked" };
  if (game.week.weekNumber > getWeekNumberForDate()) {
    return { error: "Locking isn't open yet for a future week - come back once it's the current week." };
  }

  // The pick belongs to whatever week the GAME is actually in, not
  // whatever week happens to be "current" today - this matters now that
  // players can pick ahead on future weeks' games.
  const weekId = game.weekId;

  const existingPicks = await prisma.pick.findMany({ where: { userId: user.id, weekId } });
  const alreadyExists = existingPicks.some((p) => p.gameId === gameId && p.pickType === pickType);

  if (!alreadyExists) {
    if (pickType === "DOG") {
      if (existingPicks.some((p) => p.pickType === "DOG")) {
        return { error: "Only one dog pick allowed per week." };
      }
    } else {
      const sideCount = existingPicks.filter((p) => p.pickType === "SPREAD" || p.pickType === "TOTAL").length;
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
