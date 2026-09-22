// Shared data prep for the current week's live-watching views (/watch's
// detailed list, /guide's timeline). Everything here is status/outcome
// computation - no JSX. Moved out of app/watch/page.tsx so /guide can reuse
// the exact same ESPN-matching, grading, and relevance logic instead of a
// second copy that could drift out of sync with it.
import { prisma } from "@/lib/db";
import { getOrCreateCurrentWeek } from "@/lib/currentWeek";
import { fetchEspnScoreboard, teamNamesMatch, toYyyymmdd } from "@/lib/espnScores";
import { gradePick } from "@/lib/scoring";
import { isPastLockDeadline } from "@/lib/lock";
import { computeRace, buildRaceBlurb, PickOutcome } from "@/lib/weeklyRace";

export type Rel = "swing" | "watch" | "dog" | "cold";

export async function computeWatchData() {
  const week = await getOrCreateCurrentWeek();
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const games = await prisma.game.findMany({
    where: { weekId: week.id },
    orderBy: { commenceTime: "asc" },
  });
  const picks = await prisma.pick.findMany({ where: { weekId: week.id }, include: { user: true } });

  const pickedGames = games.filter((g) => !g.voided && picks.some((p) => p.gameId === g.id));

  // Live scores: one ESPN pull per distinct date a picked game falls on.
  const dates = Array.from(new Set(pickedGames.map((g) => toYyyymmdd(g.commenceTime))));
  const espn = (await Promise.all(dates.map((d) => fetchEspnScoreboard(d)))).flat();
  const espnFor = (g: (typeof games)[number]) =>
    espn.find((r) => teamNamesMatch(g.homeTeam, r.homeTeam) && teamNamesMatch(g.awayTeam, r.awayTeam)) ?? null;

  type Status = {
    phase: "pre" | "live" | "final";
    homeScore: number | null;
    awayScore: number | null;
    detail: string | null;
    broadcast: string | null;
  };
  const statusOf = new Map<string, Status>();
  for (const g of pickedGames) {
    const e = espnFor(g);
    const final = g.isFinal || e?.completed === true;
    const live = !final && e?.state === "in";
    const phase: Status["phase"] = final ? "final" : live ? "live" : "pre";
    statusOf.set(g.id, {
      phase,
      // ESPN reports 0-0 (not null) before kickoff - only trust a score once
      // the game is actually live or final, or a not-yet-started game reads
      // as "currently 0-0" and every under looks like it's covering.
      homeScore: g.isFinal ? g.homeScore : phase === "pre" ? null : e?.homeScore ?? null,
      awayScore: g.isFinal ? g.awayScore : phase === "pre" ? null : e?.awayScore ?? null,
      detail: e?.statusDetail ?? null,
      broadcast: g.broadcast ?? e?.broadcast ?? null,
    });
  }

  const gameById = new Map(games.map((g) => [g.id, g]));

  // Only a locked pick has a line. An unlocked pick never adopts one - it
  // just won't count.
  function lineFor(pick: (typeof picks)[number]) {
    if (!pick.locked) return { line: null as number | null, dogVal: null as number | null };
    return { line: pick.lockedLine, dogVal: pick.dogSpreadValue };
  }

  function outcomeOf(pick: (typeof picks)[number]): PickOutcome {
    const st = statusOf.get(pick.gameId);
    const g = gameById.get(pick.gameId);
    if (!st || !g) return "unknown";

    // No auto-lock: an unlocked pick is either still lockable ("pending") or,
    // once its deadline passed, gone ("missed").
    if (!pick.locked) return isPastLockDeadline(g.commenceTime) ? "missed" : "pending";

    if (pick.graded) {
      if (pick.pickType === "DOG") return pick.isWin ? "won" : "lost";
      return pick.isPush ? "push" : pick.isWin ? "won" : "lost";
    }
    if (st.phase === "pre" || st.homeScore == null || st.awayScore == null) return "pending";

    const { line, dogVal } = lineFor(pick);
    if (pick.pickType !== "DOG" && line == null) return "unknown";

    const r = gradePick(
      { homeTeam: g.homeTeam, awayTeam: g.awayTeam, homeScore: st.homeScore, awayScore: st.awayScore },
      { pickType: pick.pickType, selection: pick.selection, lockedLine: line, dogSpreadValue: dogVal }
    );
    if (st.phase === "final") {
      if (pick.pickType === "DOG") return r.isWin ? "won" : "lost";
      return r.isPush ? "push" : r.isWin ? "won" : "lost";
    }
    if (pick.pickType === "DOG") return r.isWin ? "live-covering" : "live-losing";
    return r.isPush ? "pending" : r.isWin ? "live-covering" : "live-losing";
  }

  const outcome = new Map(picks.map((p) => [p.id, outcomeOf(p)]));

  // --- weekly race (SPREAD + TOTAL only) ---
  // A pick that missed its lock doesn't count - leave it out entirely rather
  // than as a loss, so a forgotten lock just shrinks that player's slate.
  const sidePicks = picks.filter((p) => p.pickType !== "DOG");
  const byUser = new Map<string, PickOutcome[]>();
  for (const p of sidePicks) {
    const o = outcome.get(p.id)!;
    if (o === "missed") continue;
    const arr = byUser.get(p.userId) ?? [];
    arr.push(o);
    byUser.set(p.userId, arr);
  }
  const race = computeRace(users.map((u) => ({ userId: u.id, name: u.name })), byUser);
  const aliveIds = new Set(race.filter((r) => r.alive).map((r) => r.userId));

  const sideGameIds = new Set(sidePicks.map((p) => p.gameId));
  const sideGames = pickedGames.filter((g) => sideGameIds.has(g.id));
  const decidedSideGames = sideGames.filter((g) => statusOf.get(g.id)?.phase === "final").length;
  const blurb = buildRaceBlurb(race, decidedSideGames, sideGames.length);

  // --- relevance of each game, for a badge + a tiebreak within a time slot ---
  const picksByGame = new Map<string, typeof picks>();
  for (const p of picks) {
    const arr = picksByGame.get(p.gameId) ?? [];
    arr.push(p);
    picksByGame.set(p.gameId, arr);
  }

  const relevanceOf = (g: (typeof games)[number]): Rel => {
    const gp = picksByGame.get(g.id) ?? [];
    const aliveSidePickers = new Set(
      gp.filter((p) => p.pickType !== "DOG" && aliveIds.has(p.userId)).map((p) => p.userId)
    );
    if (aliveSidePickers.size >= 2) return "swing";
    if (aliveSidePickers.size === 1) return "watch";
    if (gp.some((p) => p.pickType === "DOG")) return "dog";
    return "cold";
  };

  return {
    week,
    users,
    games,
    picks,
    pickedGames,
    statusOf,
    gameById,
    lineFor,
    outcome,
    race,
    aliveIds,
    blurb,
    picksByGame,
    relevanceOf,
  };
}
