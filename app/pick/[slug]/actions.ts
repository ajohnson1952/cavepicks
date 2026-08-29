"use server";

import { prisma } from "@/lib/db";
import { isGameLocked } from "@/lib/lock";
import { revalidatePath } from "next/cache";

export async function submitPicks(slug: string, formData: FormData) {
  const user = await prisma.user.findUnique({ where: { pickSlug: slug } });
  if (!user) throw new Error("Player not found");

  const week = await prisma.week.findUnique({
    where: { seasonYear_weekNumber: { seasonYear: 2026, weekNumber: 1 } },
  });
  if (!week) throw new Error("No active week found");

  const games = await prisma.game.findMany({
    where: { weekId: week.id },
    include: { oddsSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
  });
  const gameById = new Map(games.map((g) => [g.id, g]));
  const isLocked = (gameId: string) => {
    const g = gameById.get(gameId);
    return g ? isGameLocked(g.commenceTime) : true;
  };

  const existingPicks = await prisma.pick.findMany({
    where: { userId: user.id, weekId: week.id },
  });
  const lockedSideCount = existingPicks.filter(
    (p) => (p.pickType === "SPREAD" || p.pickType === "TOTAL") && isLocked(p.gameId)
  ).length;
  const lockedDog = existingPicks.find((p) => p.pickType === "DOG" && isLocked(p.gameId));

  // Only games that are still open can be changed - anything locked is left untouched
  const newSideSelections: { gameId: string; pickType: "SPREAD" | "TOTAL"; selection: string }[] = [];
  for (const game of games) {
    if (isLocked(game.id)) continue;
    const spreadVal = formData.get(`spread_${game.id}`);
    const totalVal = formData.get(`total_${game.id}`);
    if (spreadVal === "home" || spreadVal === "away") {
      newSideSelections.push({
        gameId: game.id,
        pickType: "SPREAD",
        selection: spreadVal === "home" ? game.homeTeam : game.awayTeam,
      });
    }
    if (totalVal === "over" || totalVal === "under") {
      newSideSelections.push({ gameId: game.id, pickType: "TOTAL", selection: totalVal });
    }
  }

  const dogRaw = formData.get("dogPick");
  let newDog: { gameId: string; team: string } | null = null;
  if (typeof dogRaw === "string" && dogRaw.includes("|") && !lockedDog) {
    const [gameId, team] = dogRaw.split("|");
    if (!isLocked(gameId)) newDog = { gameId, team };
  }

  const totalSideCount = lockedSideCount + newSideSelections.length;
  const totalDogCount = (lockedDog ? 1 : 0) + (newDog ? 1 : 0);

  // Only block going OVER the limits - saving partial progress (fewer than 5, or 0 dog) is fine
  if (totalSideCount > 5) {
    throw new Error(`That's ${totalSideCount} side/total picks - max is 5. Unselect one first.`);
  }
  if (totalDogCount > 1) {
    throw new Error("Only one dog pick allowed per week.");
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
}
