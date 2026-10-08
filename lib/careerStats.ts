// Career numbers shared by /history (the leaderboards) and /stats (the Records
// card): every past season's stored totals plus this season's live ones.
import { prisma } from "./db";
import { SEASON_YEAR } from "./currentWeek";
import { computeCurrentSeasonStats } from "./seasonStats";

// The live season - the only one with real Game/Pick rows behind it.
// Everything before this comes from HistoricalSeasonRecord instead (see
// schema.prisma comment on that model for why).
export const CURRENT_SEASON_YEAR = SEASON_YEAR; // lib/currentWeek.ts - the one place the season is set

// Below this many decisions (wins+losses), a season's win% is too small a
// sample to fairly call "best" or "worst" - mostly guards the current
// season early on, before a full slate of weeks has been graded.
const MIN_DECISIONS_FOR_RECORDS = 10;

export async function computeCareer() {
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const historicalRows = await prisma.historicalSeasonRecord.findMany({
    include: { user: true },
    orderBy: [{ seasonYear: "desc" }],
  });
  const { cavepicksStats: currentSide, cavedogsStats: currentDog } =
    await computeCurrentSeasonStats(CURRENT_SEASON_YEAR);

  const historicalSeasonYears = Array.from(new Set(historicalRows.map((r) => r.seasonYear))).sort(
    (a, b) => b - a
  );

  // --- All-time: every historical season's stored numbers + this season's live numbers, per user ---
  const allTimeSide = users
    .map((u) => {
      const historical = historicalRows.filter((r) => r.userId === u.id);
      const current = currentSide.find((s) => s.name === u.name);
      const weeksWon = historical.reduce((sum, r) => sum + r.weeksWon, 0) + (current?.weeksWon ?? 0);
      const wins = historical.reduce((sum, r) => sum + r.sideWins, 0) + (current?.wins ?? 0);
      const pushes = historical.reduce((sum, r) => sum + r.sidePushes, 0) + (current?.pushes ?? 0);
      const losses = historical.reduce((sum, r) => sum + r.sideLosses, 0) + (current?.losses ?? 0);
      const denom = wins + losses;
      const pct = denom > 0 ? (wins / denom) * 100 : 0;
      return { name: u.name, weeksWon, wins, pushes, losses, pct };
    })
    .sort((a, b) => b.pct - a.pct);

  const allTimeDog = users
    .map((u) => {
      const historical = historicalRows.filter((r) => r.userId === u.id);
      const current = currentDog.find((s) => s.name === u.name);
      const points = historical.reduce((sum, r) => sum + r.dogPoints, 0) + (current?.points ?? 0);
      const wins = historical.reduce((sum, r) => sum + r.dogWins, 0) + (current?.wins ?? 0);
      const losses = historical.reduce((sum, r) => sum + r.dogLosses, 0) + (current?.losses ?? 0);
      const denom = wins + losses;
      const pct = denom > 0 ? (wins / denom) * 100 : 0;
      return { name: u.name, points, wins, losses, pct };
    })
    .sort((a, b) => b.points - a.points);

  const allTimeSideTotals = allTimeSide.reduce(
    (acc, s) => ({ wins: acc.wins + s.wins, pushes: acc.pushes + s.pushes, losses: acc.losses + s.losses }),
    { wins: 0, pushes: 0, losses: 0 }
  );
  const allTimeSideDenom = allTimeSideTotals.wins + allTimeSideTotals.losses;
  const allTimeSidePct = allTimeSideDenom > 0 ? (allTimeSideTotals.wins / allTimeSideDenom) * 100 : 0;

  const allTimeDogTotals = allTimeDog.reduce(
    (acc, s) => ({ points: acc.points + s.points, wins: acc.wins + s.wins, losses: acc.losses + s.losses }),
    { points: 0, wins: 0, losses: 0 }
  );
  const allTimeDogDenom = allTimeDogTotals.wins + allTimeDogTotals.losses;
  const allTimeDogPct = allTimeDogDenom > 0 ? (allTimeDogTotals.wins / allTimeDogDenom) * 100 : 0;

  // --- Fun records: best/worst single-season win%, career weeks won, career dog points ---
  const allSeasonEntries = [
    ...historicalRows.map((r) => ({
      name: r.user.name,
      seasonLabel: String(r.seasonYear),
      wins: r.sideWins,
      losses: r.sideLosses,
      pct: r.sideWins + r.sideLosses > 0 ? (r.sideWins / (r.sideWins + r.sideLosses)) * 100 : 0,
    })),
    ...currentSide.map((s) => ({
      name: s.name,
      seasonLabel: `${CURRENT_SEASON_YEAR} (in progress)`,
      wins: s.wins,
      losses: s.losses,
      pct: s.pct,
    })),
  ].filter((e) => e.wins + e.losses >= MIN_DECISIONS_FOR_RECORDS);

  const bestSeason =
    allSeasonEntries.length > 0 ? allSeasonEntries.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const worstSeason =
    allSeasonEntries.length > 0 ? allSeasonEntries.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;
  const careerWeeksLeader =
    allTimeSide.length > 0 ? allTimeSide.reduce((a, b) => (b.weeksWon > a.weeksWon ? b : a)) : null;
  const careerDogLeader =
    allTimeDog.length > 0 ? allTimeDog.reduce((a, b) => (b.points > a.points ? b : a)) : null;

  return {
    historicalRows,
    historicalSeasonYears,
    currentSide,
    currentDog,
    allTimeSide,
    allTimeDog,
    allTimeSideTotals,
    allTimeSidePct,
    allTimeDogTotals,
    allTimeDogPct,
    bestSeason,
    worstSeason,
    careerWeeksLeader,
    careerDogLeader,
  };
}
