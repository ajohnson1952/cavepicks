"use server";

import { prisma } from "@/lib/db";
import { isPastAutoLock, getCurrentWeekBounds } from "@/lib/lock";
import { getOrCreateCurrentWeek } from "@/lib/currentWeek";
import { revalidatePath } from "next/cache";

export async function submitPicks(
  slug: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const user = await prisma.user.findUnique({ where: { pickSlug: slug } });
  if (!user) return { error: "Player not found" };

  const week = await getOrCreateCurrentWeek();

  const { start, end } = getCurrentWeekBounds();
  const games = await prisma.game.findMany({
    where: { weekId: week.id, commenceTime: { gte: start, lte: end } },
    include: { oddsSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
  });
  const gameById = new Map(games.map((g) => [g.id, g]));

  const existingPicks = await prisma.pick.findMany({
    where: { userId: user.id, weekId: week.id },
  });
  const pickLookup = new Map(existingPicks.map((p) => [`${p.gameId}_${p.pickType}`, p]));

  const lockedSideCount = existingPicks.filter(
    (p) => (p.pickType === "SPREAD" || p.pickType === "TOTAL") && p.locked
  ).length;
  const lockedDog = existingPicks.find((p) => p.pickType === "DOG" && p.locked);

  // Only unlocked picks on games that haven't hit the 30-min auto-lock deadline can change
  const newSideSelections: { gameId: string; pickType: "SPREAD" | "TOTAL"; selection: string }[] = [];
  for (const game of games) {
    if (isPastAutoLock(game.commenceTime)) continue;

    const spreadPick = pickLookup.get(`${game.id}_SPREAD`);
    if (!spreadPick?.locked) {
      const spreadVal = formData.get(`spread_${game.id}`);
      if (spreadVal === "home" || spreadVal === "away") {
        newSideSelections.push({
          gameId: game.id,
          pickType: "SPREAD",
          selection: spreadVal === "home" ? game.homeTeam : game.awayTeam,
        });
      }
    }

    const totalPick = pickLookup.get(`${game.id}_TOTAL`);
    if (!totalPick?.locked) {
      const totalVal = formData.get(`total_${game.id}`);
      if (totalVal === "over" || totalVal === "under") {
        newSideSelections.push({ gameId: game.id, pickType: "TOTAL", selection: totalVal });
      }
    }
  }

  const dogRaw = formData.get("dogPick");
  let newDog: { gameId: string; team: string } | null = null;
  if (typeof dogRaw === "string" && dogRaw.includes("|") && !lockedDog) {
    const [gameId, team] = dogRaw.split("|");
    const game = gameById.get(gameId);
    if (game && !isPastAutoLock(game.commenceTime)) newDog = { gameId, team };
  }

  const totalSideCount = lockedSideCount + newSideSelections.length;
  const totalDogCount = (lockedDog ? 1 : 0) + (newDog ? 1 : 0);

  if (totalSideCount > 5) {
    return { error: `That's ${totalSideCount} side/total picks - max is 5. Unselect one first.` };
  }
  if (totalDogCount > 1) {
    return { error: "Only one dog pick allowed per week." };
  }

  for (const sel of newSideSelections) {
    await prisma.pick.upsert({
      where: {
        userId_weekId_gameId_pickType: {
          userId: user.id,
          weekId: week.id,
          gameId: sel.gameId,
          pickType: sel.pickType,
        },
      },
      update: { selection: sel.selection },
      create: {
        userId: user.id,
        weekId: week.id,
        gameId: sel.gameId,
        pickType: sel.pickType,
        selection: sel.selection,
      },
    });
  }

  if (newDog) {
    await prisma.pick.upsert({
      where: {
        userId_weekId_gameId_pickType: {
          userId: user.id,
          weekId: week.id,
          gameId: newDog.gameId,
          pickType: "DOG",
        },
      },
      update: { selection: newDog.team },
      create: {
        userId: user.id,
        weekId: week.id,
        gameId: newDog.gameId,
        pickType: "DOG",
        selection: newDog.team,
      },
    });
  }

  revalidatePath(`/pick/${slug}`);
  revalidatePath("/board");
  return { error: null };
}

// Freezes ONE pick using whatever line is already cached from the last background
// pull - no live API call. This is the player-initiated "Lock In" button.
export async function lockPick(slug: string, pickId: string) {
  const user = await prisma.user.findUnique({ where: { pickSlug: slug } });
  if (!user) return { error: "Player not found" };

  const pick = await prisma.pick.findUnique({
    where: { id: pickId },
    include: { game: { include: { oddsSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 } } } },
  });
  if (!pick || pick.userId !== user.id) return { error: "Pick not found" };
  if (pick.locked) return { error: "Already locked" };

  const snap = pick.game.oddsSnapshots[0];
  if (!snap) return { error: "No odds available yet to lock against" };

  const data: {
    locked: boolean;
    lockedAt: Date;
    lockedLine?: number | null;
    dogSpreadValue?: number | null;
  } = { locked: true, lockedAt: new Date() };

  if (pick.pickType === "SPREAD") {
    data.lockedLine = pick.selection === pick.game.homeTeam ? snap.spreadHome : snap.spreadAway;
  } else if (pick.pickType === "TOTAL") {
    data.lockedLine = snap.total;
  } else if (pick.pickType === "DOG") {
    data.dogSpreadValue =
      pick.selection === pick.game.homeTeam
        ? Math.abs(snap.spreadHome ?? 0)
        : Math.abs(snap.spreadAway ?? 0);
  }

  await prisma.pick.update({ where: { id: pickId }, data });
  revalidatePath(`/pick/${slug}`);
  revalidatePath("/board");
  return { error: null };
}

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
    data: { locked: false, lockedAt: null, lockedLine: null, dogSpreadValue: null },
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

// Locks a pick directly from whatever's currently selected in the form -
// no separate Save step needed first. Creates the pick if it doesn't exist yet.
export async function lockSelection(
  slug: string,
  gameId: string,
  pickType: "SPREAD" | "TOTAL" | "DOG",
  formData: FormData
) {
  const user = await prisma.user.findUnique({ where: { pickSlug: slug } });
  if (!user) return { error: "Player not found" };

  const week = await getOrCreateCurrentWeek();

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { oddsSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
  });
  if (!game) return { error: "Game not found" };
  if (isPastAutoLock(game.commenceTime)) return { error: "This game already auto-locked" };

  const snap = game.oddsSnapshots[0];
  if (!snap) return { error: "No odds available yet to lock against" };

  let selection: string | null = null;

  if (pickType === "SPREAD") {
    const val = formData.get(`spread_${gameId}`);
    if (val === "home") selection = game.homeTeam;
    else if (val === "away") selection = game.awayTeam;
  } else if (pickType === "TOTAL") {
    const val = formData.get(`total_${gameId}`);
    if (val === "over" || val === "under") selection = val;
  } else if (pickType === "DOG") {
    const dogRaw = formData.get("dogPick");
    if (typeof dogRaw === "string" && dogRaw.includes("|")) {
      const [gId, team] = dogRaw.split("|");
      if (gId === gameId) selection = team;
    }
  }

  if (!selection) return { error: "Select a pick first, then lock it in." };

  const existingPicks = await prisma.pick.findMany({ where: { userId: user.id, weekId: week.id } });
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

  const data: {
    selection: string;
    locked: boolean;
    lockedAt: Date;
    lockedLine?: number | null;
    dogSpreadValue?: number | null;
  } = { selection, locked: true, lockedAt: new Date() };

  if (pickType === "SPREAD") {
    data.lockedLine = selection === game.homeTeam ? snap.spreadHome : snap.spreadAway;
  } else if (pickType === "TOTAL") {
    data.lockedLine = snap.total;
  } else if (pickType === "DOG") {
    data.dogSpreadValue =
      selection === game.homeTeam ? Math.abs(snap.spreadHome ?? 0) : Math.abs(snap.spreadAway ?? 0);
  }

  await prisma.pick.upsert({
    where: { userId_weekId_gameId_pickType: { userId: user.id, weekId: week.id, gameId, pickType } },
    update: data,
    create: { userId: user.id, weekId: week.id, gameId, pickType, ...data },
  });

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

  const week = await getOrCreateCurrentWeek();

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) return { error: "Game not found" };
  if (isPastAutoLock(game.commenceTime)) return { error: "This game already auto-locked" };

  const existingPicks = await prisma.pick.findMany({ where: { userId: user.id, weekId: week.id } });
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
    where: { userId_weekId_gameId_pickType: { userId: user.id, weekId: week.id, gameId, pickType } },
    update: { selection },
    create: { userId: user.id, weekId: week.id, gameId, pickType, selection },
  });

  revalidatePath(`/pick/${slug}`);
  revalidatePath("/board");
  return { error: null };
}

// Locks a pick using a value passed directly from client state - no <form>
// or FormData needed, called as a plain function from a button's onClick.
export async function lockValue(
  slug: string,
  gameId: string,
  pickType: "SPREAD" | "TOTAL" | "DOG",
  selection: string
) {
  const user = await prisma.user.findUnique({ where: { pickSlug: slug } });
  if (!user) return { error: "Player not found" };

  const week = await getOrCreateCurrentWeek();

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { oddsSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
  });
  if (!game) return { error: "Game not found" };
  if (isPastAutoLock(game.commenceTime)) return { error: "This game already auto-locked" };

  const snap = game.oddsSnapshots[0];
  if (!snap) return { error: "No odds available yet to lock against" };

  const existingPicks = await prisma.pick.findMany({ where: { userId: user.id, weekId: week.id } });
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

  const data: {
    selection: string;
    locked: boolean;
    lockedAt: Date;
    lockedLine?: number | null;
    lockedOdds?: number | null;
    dogSpreadValue?: number | null;
  } = { selection, locked: true, lockedAt: new Date() };

  if (pickType === "SPREAD") {
    const isHome = selection === game.homeTeam;
    data.lockedLine = isHome ? snap.spreadHome : snap.spreadAway;
    data.lockedOdds = isHome ? snap.spreadHomePrice : snap.spreadAwayPrice;
  } else if (pickType === "TOTAL") {
    data.lockedLine = snap.total;
    data.lockedOdds = selection === "over" ? snap.totalOverPrice : snap.totalUnderPrice;
  } else if (pickType === "DOG") {
    const isHome = selection === game.homeTeam;
    data.dogSpreadValue = Math.abs((isHome ? snap.spreadHome : snap.spreadAway) ?? 0);
    data.lockedOdds = isHome ? snap.mlHome : snap.mlAway;
  }

  await prisma.pick.upsert({
    where: { userId_weekId_gameId_pickType: { userId: user.id, weekId: week.id, gameId, pickType } },
    update: data,
    create: { userId: user.id, weekId: week.id, gameId, pickType, ...data },
  });


  revalidatePath(`/pick/${slug}`);
  revalidatePath("/board");
  return { error: null };
}
