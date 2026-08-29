"use server";

import { prisma } from "@/lib/db";
import { isPastAutoLock, getCurrentWeekBounds } from "@/lib/lock";
import { revalidatePath } from "next/cache";

export async function submitPicks(
  slug: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const user = await prisma.user.findUnique({ where: { pickSlug: slug } });
  if (!user) return { error: "Player not found" };

  const week = await prisma.week.findUnique({
    where: { seasonYear_weekNumber: { seasonYear: 2026, weekNumber: 1 } },
  });
  if (!week) return { error: "No active week found" };

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
  return { error: null };
}
