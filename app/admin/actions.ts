"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { gradePick } from "@/lib/scoring";
import { runGradeResults, summarizeGradeRun } from "@/lib/gradeResults";
import { pullOdds } from "@/lib/pullOdds";
import { recordJobRun } from "@/lib/jobRun";

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

// Players cannot unlock their own picks - locks are final. The admin can,
// for a genuine misclick / bug / dispute. Wipes the frozen line and any
// grading so the player can re-pick and re-lock (or leave it unlocked, in
// which case it just won't count).
export async function adminUnlockPick(formData: FormData) {
  if (!isAuthed()) return;
  const pickId = formData.get("pickId");
  if (typeof pickId !== "string") return;

  await prisma.pick.update({
    where: { id: pickId },
    data: {
      locked: false,
      lockedAt: null,
      lockedLine: null,
      lockedOdds: null,
      dogSpreadValue: null,
      lockedBook: null,
      graded: false,
      isWin: null,
      isPush: null,
      pointsEarned: 0,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/board");
  revalidatePath("/standings");
  revalidatePath("/watch");
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

// Runs the same grading pass the "grade-results" cron hits, on demand -
// for checking whether the cron is actually keeping up, or just not waiting
// for the next scheduled run when something looks stuck.
export async function runGradeResultsNow() {
  if (!isAuthed()) return;
  try {
    const result = await runGradeResults();
    await recordJobRun("grade-results", "manual", true, summarizeGradeRun(result));
  } catch (err: any) {
    await recordJobRun("grade-results", "manual", false, err.message);
  }
  revalidatePath("/admin");
  revalidatePath("/board");
  revalidatePath("/standings");
  revalidatePath("/watch");
}

// Runs the same odds pull the "pull-odds" cron hits, on demand.
export async function runPullOddsNow() {
  if (!isAuthed()) return;
  try {
    const { results, bookCounts, unmatchedTeams } = await pullOdds();
    const bookSummary = Object.entries(bookCounts).map(([k, v]) => `${k}:${v}`).join(" ");
    await recordJobRun(
      "pull-odds",
      "manual",
      true,
      `${results.length} games pulled (${bookSummary})${unmatchedTeams.length ? `, ${unmatchedTeams.length} unmatched teams` : ""}`
    );
  } catch (err: any) {
    await recordJobRun("pull-odds", "manual", false, err.message);
  }
  revalidatePath("/admin");
  revalidatePath("/board");
  revalidatePath("/pick");
  revalidatePath("/watch");
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
