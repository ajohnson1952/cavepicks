"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { gradePick } from "@/lib/scoring";
import { runGradeResults, summarizeGradeRun } from "@/lib/gradeResults";
import { pullOdds } from "@/lib/pullOdds";
import { recordJobRun } from "@/lib/jobRun";
import { mergeGame } from "@/lib/mergeGames";
import { UNLOCK_DATA } from "@/lib/unlockPick";
import { unlockStaleLocks } from "@/lib/unlockStaleLocks";

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

  await prisma.pick.update({ where: { id: pickId }, data: UNLOCK_DATA });

  revalidatePath("/admin");
  revalidatePath("/board");
  revalidatePath("/standings");
  revalidatePath("/watch");
}

// Bulk version of adminUnlockPick - for when pull-odds went quiet for a
// stretch (see /api/debug-cron-history) and several players locked picks
// against whatever stale line was still on screen before the next real
// pull refreshed it. Unlocks every currently-locked pick in the given week
// whose lockedAt is before the given cutoff.
export async function bulkUnlockStaleLocks(formData: FormData) {
  if (!isAuthed()) return;
  const weekNumber = Number(formData.get("weekNumber"));
  const cutoffRaw = formData.get("cutoff");
  if (!Number.isFinite(weekNumber)) return;
  const cutoff = typeof cutoffRaw === "string" && cutoffRaw ? new Date(cutoffRaw) : new Date();
  if (isNaN(cutoff.getTime())) return;

  await unlockStaleLocks(weekNumber, 2026, cutoff);

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

// Fixes a rare Odds API bug: a rescheduled game sometimes comes back under
// a brand-new event id instead of updating the original event's
// commenceTime, leaving two Game rows for what's really one real-world game
// - one with the correct kickoff, one a stale phantom ESPN never has a
// matching game for, so it never grades and just piles up as "unmatched"
// on every grading run. Moves every pick off the stale row onto the correct
// one, then voids the stale row. If any pick would collide with one
// already on the correct row (same user/week/pickType), that one's left in
// place and the stale row is NOT voided, so nothing silently disappears -
// check it manually instead.
export async function mergeDuplicateGame(formData: FormData) {
  if (!isAuthed()) return;
  const fromGameId = formData.get("fromGameId");
  const toGameId = formData.get("toGameId");
  if (typeof fromGameId !== "string" || typeof toGameId !== "string") return;
  const to = toGameId.trim();
  if (!to || to === fromGameId) return;

  const toGame = await prisma.game.findUnique({ where: { id: to } });
  if (!toGame) return;

  await mergeGame(fromGameId, toGame.id, `Duplicate odds-API event, merged into ${toGame.awayTeam} @ ${toGame.homeTeam}`);

  revalidatePath("/admin");
  revalidatePath("/board");
  revalidatePath("/standings");
  revalidatePath("/watch");
  revalidatePath("/pick");
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
    const { results, bookCounts, unmatchedTeams, mergedDuplicates } = await pullOdds();
    const bookSummary = Object.entries(bookCounts).map(([k, v]) => `${k}:${v}`).join(" ");
    await recordJobRun(
      "pull-odds",
      "manual",
      true,
      `${results.length} games pulled (${bookSummary})` +
        `${unmatchedTeams.length ? `, ${unmatchedTeams.length} unmatched teams` : ""}` +
        `${mergedDuplicates.length ? `, ${mergedDuplicates.length} duplicate game(s) auto-merged` : ""}`
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
