"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { gradePick } from "@/lib/scoring";

const ADMIN_COOKIE = "admin_session";

function isAuthed(): boolean {
  return cookies().get(ADMIN_COOKIE)?.value === "authenticated";
}

export async function adminLogin(formData: FormData) {
  const password = formData.get("password");
  if (
    typeof password === "string" &&
    process.env.ADMIN_PASSWORD &&
    password === process.env.ADMIN_PASSWORD
  ) {
    cookies().set(ADMIN_COOKIE, "authenticated", {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  }
  revalidatePath("/admin");
}

export async function adminLogout() {
  cookies().delete(ADMIN_COOKIE);
  revalidatePath("/admin");
}

// Marks a game postponed/cancelled - it stops blocking its week's pot from
// resolving, and no picks on it ever get graded (no win, no loss, no push).
export async function voidGame(formData: FormData) {
  if (!isAuthed()) return;
  const gameId = formData.get("gameId");
  const reason = formData.get("reason");
  if (typeof gameId !== "string") return;

  await prisma.game.update({
    where: { id: gameId },
    data: {
      voided: true,
      voidReason: typeof reason === "string" && reason.trim() ? reason.trim() : "Postponed/cancelled",
    },
  });

  revalidatePath("/admin");
  revalidatePath("/board");
  revalidatePath("/standings");
}

export async function unvoidGame(formData: FormData) {
  if (!isAuthed()) return;
  const gameId = formData.get("gameId");
  if (typeof gameId !== "string") return;

  await prisma.game.update({ where: { id: gameId }, data: { voided: false, voidReason: null } });

  revalidatePath("/admin");
  revalidatePath("/board");
  revalidatePath("/standings");
}

// Manually sets a final score and immediately grades every pick tied to
// that game - for correcting ESPN mismatches or filling in a game the
// automatic pipeline never caught.
export async function setManualScore(formData: FormData) {
  if (!isAuthed()) return;
  const gameId = formData.get("gameId");
  const homeScoreRaw = formData.get("homeScore");
  const awayScoreRaw = formData.get("awayScore");
  if (typeof gameId !== "string") return;

  const homeScore = Number(homeScoreRaw);
  const awayScore = Number(awayScoreRaw);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return;

  const game = await prisma.game.update({
    where: { id: gameId },
    data: { homeScore, awayScore, isFinal: true, voided: false },
  });

  const picks = await prisma.pick.findMany({ where: { gameId } });
  for (const pick of picks) {
    const result = gradePick(
      { homeTeam: game.homeTeam, awayTeam: game.awayTeam, homeScore, awayScore },
      {
        pickType: pick.pickType,
        selection: pick.selection,
        lockedLine: pick.lockedLine,
        dogSpreadValue: pick.dogSpreadValue,
      }
    );
    await prisma.pick.update({
      where: { id: pick.id },
      data: { graded: true, isWin: result.isWin, isPush: result.isPush, pointsEarned: result.pointsEarned },
    });
  }

  revalidatePath("/admin");
  revalidatePath("/board");
  revalidatePath("/standings");
}
