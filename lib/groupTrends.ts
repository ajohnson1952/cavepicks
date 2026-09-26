// Group-wide (not per-player) pick trends for /history - how the group as a
// whole leans and performs, not individual behavior. Only covers the live
// season (HistoricalSeasonRecord rows are hand-entered summaries with no
// per-pick selection/line data behind them).
import { prisma } from "./db";
import { getWeekNumberForDate } from "./currentWeek";

export type SplitRecord = { wins: number; losses: number; pushes: number; pct: number; count: number };
export type TeamPopularity = {
  team: string;
  count: number;
  wins: number;
  losses: number;
  pushes: number;
  pct: number;
};
export type WeeklyAccuracy = { weekNumber: number; correct: number; total: number; pct: number };

function toRecord(picks: { isWin: boolean | null; isPush: boolean | null }[]): SplitRecord {
  const wins = picks.filter((p) => p.isWin === true).length;
  const losses = picks.filter((p) => p.isWin === false && !p.isPush).length;
  const pushes = picks.filter((p) => p.isPush === true).length;
  const denom = wins + losses;
  return { wins, losses, pushes, pct: denom > 0 ? (wins / denom) * 100 : 0, count: picks.length };
}

export async function computeGroupTrends(seasonYear: number) {
  const currentWeekNumber = getWeekNumberForDate();
  const weeks = await prisma.week.findMany({
    where: { seasonYear, weekNumber: { gte: 1, lte: currentWeekNumber } },
    orderBy: { weekNumber: "asc" },
  });
  const weekIds = weeks.map((w) => w.id);

  const gradedSidePicks = await prisma.pick.findMany({
    where: { weekId: { in: weekIds }, pickType: { in: ["SPREAD", "TOTAL"] }, graded: true },
    include: { game: true },
  });

  const spreadPicks = gradedSidePicks.filter((p) => p.pickType === "SPREAD" && p.lockedLine !== null);
  const totalPicks = gradedSidePicks.filter((p) => p.pickType === "TOTAL");

  // Favorite/underdog is by lockedLine sign - negative for favorites,
  // positive for underdogs (see lib/scoring.ts). Not to be confused with the
  // separate Cavedogs moneyline pool - this is picking the underdog ATS.
  const favoriteRecord = toRecord(spreadPicks.filter((p) => (p.lockedLine ?? 0) < 0));
  const underdogRecord = toRecord(spreadPicks.filter((p) => (p.lockedLine ?? 0) > 0));
  const homeRecord = toRecord(spreadPicks.filter((p) => p.selection === p.game.homeTeam));
  const awayRecord = toRecord(spreadPicks.filter((p) => p.selection === p.game.awayTeam));
  const overRecord = toRecord(totalPicks.filter((p) => p.selection.toLowerCase() === "over"));
  const underRecord = toRecord(totalPicks.filter((p) => p.selection.toLowerCase() === "under"));

  // --- Most popular teams: which teams the group has piled onto most, ATS ---
  const teamStats = new Map<string, { count: number; wins: number; losses: number; pushes: number }>();
  for (const p of spreadPicks) {
    const cur = teamStats.get(p.selection) ?? { count: 0, wins: 0, losses: 0, pushes: 0 };
    cur.count++;
    if (p.isWin === true) cur.wins++;
    else if (p.isPush === true) cur.pushes++;
    else if (p.isWin === false) cur.losses++;
    teamStats.set(p.selection, cur);
  }
  const mostPickedTeams: TeamPopularity[] = Array.from(teamStats.entries())
    .map(([team, s]) => ({
      team,
      count: s.count,
      wins: s.wins,
      losses: s.losses,
      pushes: s.pushes,
      pct: s.wins + s.losses > 0 ? (s.wins / (s.wins + s.losses)) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // --- Week-by-week group accuracy trend, across every side pick made ---
  const weeklyAccuracy: WeeklyAccuracy[] = weeks
    .map((w) => {
      const wp = gradedSidePicks.filter((p) => p.weekId === w.id);
      const correct = wp.filter((p) => p.isWin === true).length;
      const decided = wp.filter((p) => p.isWin === true || (p.isWin === false && !p.isPush)).length;
      return { weekNumber: w.weekNumber, correct, total: decided, pct: decided > 0 ? (correct / decided) * 100 : 0 };
    })
    .filter((w) => w.total > 0);

  return {
    favoriteRecord,
    underdogRecord,
    homeRecord,
    awayRecord,
    overRecord,
    underRecord,
    mostPickedTeams,
    weeklyAccuracy,
  };
}
