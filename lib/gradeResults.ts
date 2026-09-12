// lib/gradeResults.ts
import { prisma } from "./db";
import { fetchEspnScoreboard, teamNamesMatch, toYyyymmdd, EspnResult } from "./espnScores";
import { gradePick } from "./scoring";

// Cap games processed per invocation so a pathological backlog (e.g. a whole
// season's worth of ungraded games) can't spike memory on Render's 512MB
// free instance. This cron runs every 30 min, so any overflow is picked up
// on the next pass - ordered oldest-first so nothing starves.
const MAX_GAMES_PER_RUN = 60;

export async function runGradeResults() {
  // Any game that's already kicked off but isn't marked final yet - across
  // ALL weeks, not just "this week". Using each game's own clock instead of
  // week boundaries means a late Monday-night game from last week still gets
  // graded even after the calendar has already rolled into a new week.
  const games = await prisma.game.findMany({
    where: { isFinal: false, voided: false, commenceTime: { lte: new Date() } },
    orderBy: { commenceTime: "asc" },
    take: MAX_GAMES_PER_RUN,
  });

  // Fetch each ungraded game's date, plus the day before/after as a safety
  // net - ESPN's date-bucketing can behave oddly right at midnight boundaries,
  // and this costs nothing since it's a free, unlimited public endpoint.
  const dates = new Set<string>();
  for (const g of games) {
    const base = g.commenceTime;
    for (const offsetDays of [-1, 0, 1]) {
      const shifted = new Date(base.getTime() + offsetDays * 24 * 60 * 60 * 1000);
      dates.add(toYyyymmdd(shifted));
    }
  }
  const allResults: EspnResult[] = [];
  for (const d of dates) {
    const results = await fetchEspnScoreboard(d);
    allResults.push(...results);
  }

  let gamesGraded = 0;
  let picksGraded = 0;
  let skippedUnlocked = 0; // picks a player never locked - they don't count
  const gradedIds = new Set<string>();
  const unmatched: { ourGame: string; date: string; espnGamesThatDay: string[] }[] = [];
  const stillInProgress: string[] = [];

  for (const game of games) {
    const nameMatches = allResults.filter(
      (r) => teamNamesMatch(game.homeTeam, r.homeTeam) && teamNamesMatch(game.awayTeam, r.awayTeam)
    );
    // If the widened date net returned this game under more than one date
    // bucket, prefer any copy that's actually marked completed over a stale one.
    const nameMatch = nameMatches.find((r) => r.completed) ?? nameMatches[0];

    if (!nameMatch) {
      const gameDate = toYyyymmdd(game.commenceTime);
      unmatched.push({
        ourGame: `${game.awayTeam} @ ${game.homeTeam}`,
        date: gameDate,
        espnGamesThatDay: allResults
          .filter((r) => toYyyymmdd(new Date(r.dateISO)) === gameDate)
          .map((r) => `${r.awayTeam} @ ${r.homeTeam}${r.completed ? "" : " (not final yet)"}`),
      });
      continue;
    }

    if (!nameMatch.completed) {
      // Found the right game, it just hasn't finished playing - not a problem
      stillInProgress.push(`${game.awayTeam} @ ${game.homeTeam}`);
      continue;
    }

    const match = nameMatch;

    await prisma.game.update({
      where: { id: game.id },
      data: { homeScore: match.homeScore, awayScore: match.awayScore, isFinal: true },
    });
    gamesGraded++;
    gradedIds.add(game.id);

    const picks = await prisma.pick.findMany({ where: { gameId: game.id } });

    for (const pick of picks) {
      // No auto-lock: a pick the player never locked doesn't count. Leave it
      // ungraded (pointsEarned 0, isWin null) so it's just absent from the
      // week rather than a loss.
      if (!pick.locked) {
        skippedUnlocked++;
        continue;
      }

      const lockedLine = pick.lockedLine;
      const dogSpreadValue = pick.dogSpreadValue;

      // A locked pick with no line is a data problem, not a normal case -
      // skip rather than grade against a fake 0.
      const hasUsableLine =
        pick.pickType === "DOG" ? dogSpreadValue != null : lockedLine != null;
      if (!hasUsableLine) continue;

      const result = gradePick(
        { homeTeam: game.homeTeam, awayTeam: game.awayTeam, homeScore: match.homeScore, awayScore: match.awayScore },
        { pickType: pick.pickType, selection: pick.selection, lockedLine, dogSpreadValue }
      );

      await prisma.pick.update({
        where: { id: pick.id },
        data: {
          graded: true,
          isWin: result.isWin,
          isPush: result.isPush,
          pointsEarned: result.pointsEarned,
        },
      });
      picksGraded++;
    }
  }

  // Only surface timing debug for games that did NOT get graded this run -
  // that's the only case anyone inspects it for, and it keeps the response
  // (and the memory to serialize it) small on a big Saturday slate.
  const debugInfo = games
    .filter((g) => !gradedIds.has(g.id))
    .slice(0, 15)
    .map((g) => ({
      matchup: `${g.awayTeam} @ ${g.homeTeam}`,
      commenceTimeRaw: g.commenceTime.toISOString(),
      queriedAsDate: toYyyymmdd(g.commenceTime),
    }));

  return {
    ok: true,
    gamesGraded,
    picksGraded,
    skippedUnlocked,
    processed: games.length,
    capped: games.length === MAX_GAMES_PER_RUN,
    stillInProgress,
    unmatched,
    debugInfo,
  } as const;
}

export function summarizeGradeRun(result: Awaited<ReturnType<typeof runGradeResults>>): string {
  if (result.processed === 0) return "nothing left to grade";
  const parts = [`${result.gamesGraded} game${result.gamesGraded === 1 ? "" : "s"} graded`];
  parts.push(`${result.picksGraded} pick${result.picksGraded === 1 ? "" : "s"} graded`);
  if (result.skippedUnlocked) parts.push(`${result.skippedUnlocked} skipped (not locked)`);
  if (result.stillInProgress.length) parts.push(`${result.stillInProgress.length} still in progress`);
  if (result.unmatched.length) parts.push(`${result.unmatched.length} unmatched vs ESPN`);
  return parts.join(", ");
}
