// Fun, lighthearted "behavior" stats derived from real lock timestamps and
// pick selections - not standings, just for laughs on /history. Only covers
// the live season (HistoricalSeasonRecord rows are hand-entered summaries
// with no lockedAt/selection data behind them, so pre-app seasons can't
// feed these).
import { prisma } from "./db";
import { getWeekNumberForDate } from "./currentWeek";

export type LockTimingStat = { name: string; avgMinutesBefore: number; count: number };
export type BuzzerBeaterStat = {
  name: string;
  minutesBefore: number;
  game: string;
  weekNumber: number;
};
export type LeanStat = { name: string; pct: number; count: number };
export type MissedStat = { name: string; missedWeeks: number };
export type FlipFlopStat = { name: string; avgChanges: number; totalChanges: number; count: number };
export type DeliberationStat = { name: string; avgMinutes: number; count: number };

// Below this many locked side/total picks, a player's average lock-timing
// is too small a sample to fairly call "earliest" or "latest".
const MIN_LOCKS_FOR_TIMING = 15;
// Below this many locked totals/spread picks, an over/under or chalk/dog
// lean percentage is too noisy to be a fair "most extreme" call.
const MIN_PICKS_FOR_LEAN = 8;

export async function computeFunStats(seasonYear: number) {
  const currentWeekNumber = getWeekNumberForDate();
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const weeks = await prisma.week.findMany({
    where: { seasonYear, weekNumber: { gte: 1, lte: currentWeekNumber } },
  });
  const weekIds = weeks.map((w) => w.id);

  const lockedPicks = await prisma.pick.findMany({
    where: {
      weekId: { in: weekIds },
      pickType: { in: ["SPREAD", "TOTAL"] },
      locked: true,
      lockedAt: { not: null },
    },
    include: { game: true, user: true, week: true },
  });

  // All locked picks (any type) - used for the Flip-Flopper stat, since
  // changing your mind matters just as much on a dog pick as a spread pick.
  const allLockedPicks = await prisma.pick.findMany({
    where: { weekId: { in: weekIds }, locked: true },
    include: { user: true },
  });

  // --- Lock timing: minutes between locking a pick and that game's kickoff ---
  const timingByUser = new Map<string, number[]>();
  let buzzerBeater: BuzzerBeaterStat | null = null;
  for (const p of lockedPicks) {
    if (!p.lockedAt) continue;
    const minutesBefore = (p.game.commenceTime.getTime() - p.lockedAt.getTime()) / 60000;
    if (minutesBefore < 0) continue; // shouldn't happen, lock deadline guards this - defensive only
    const arr = timingByUser.get(p.user.name) ?? [];
    arr.push(minutesBefore);
    timingByUser.set(p.user.name, arr);
    if (!buzzerBeater || minutesBefore < buzzerBeater.minutesBefore) {
      buzzerBeater = {
        name: p.user.name,
        minutesBefore,
        game: `${p.game.awayTeam} @ ${p.game.homeTeam}`,
        weekNumber: p.week.weekNumber,
      };
    }
  }
  const timingStats: LockTimingStat[] = Array.from(timingByUser.entries())
    .map(([name, arr]) => ({
      name,
      avgMinutesBefore: arr.reduce((a, b) => a + b, 0) / arr.length,
      count: arr.length,
    }))
    .filter((s) => s.count >= MIN_LOCKS_FOR_TIMING);
  const earlyBird =
    timingStats.length > 0
      ? timingStats.reduce((a, b) => (b.avgMinutesBefore > a.avgMinutesBefore ? b : a))
      : null;
  const lastSecondLarry =
    timingStats.length > 0
      ? timingStats.reduce((a, b) => (b.avgMinutesBefore < a.avgMinutesBefore ? b : a))
      : null;

  // --- Over/under lean, on TOTAL picks only ---
  const totalPicks = lockedPicks.filter((p) => p.pickType === "TOTAL");
  const overByUser = new Map<string, { over: number; count: number }>();
  let groupOver = 0;
  for (const p of totalPicks) {
    const isOver = p.selection.toLowerCase() === "over";
    if (isOver) groupOver++;
    const cur = overByUser.get(p.user.name) ?? { over: 0, count: 0 };
    cur.count++;
    if (isOver) cur.over++;
    overByUser.set(p.user.name, cur);
  }
  const overStats: LeanStat[] = Array.from(overByUser.entries())
    .map(([name, { over, count }]) => ({ name, pct: (over / count) * 100, count }))
    .filter((s) => s.count >= MIN_PICKS_FOR_LEAN);
  const overLover = overStats.length > 0 ? overStats.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const underLover = overStats.length > 0 ? overStats.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;
  const groupOverPct = totalPicks.length > 0 ? (groupOver / totalPicks.length) * 100 : 0;

  // --- Chalk (favorite) vs dog lean, on SPREAD picks only. lockedLine is
  // negative for favorites, positive for underdogs (see lib/scoring.ts). ---
  const spreadPicks = lockedPicks.filter((p) => p.pickType === "SPREAD" && p.lockedLine !== null);
  const chalkByUser = new Map<string, { chalk: number; count: number }>();
  for (const p of spreadPicks) {
    const isChalk = (p.lockedLine ?? 0) < 0;
    const cur = chalkByUser.get(p.user.name) ?? { chalk: 0, count: 0 };
    cur.count++;
    if (isChalk) cur.chalk++;
    chalkByUser.set(p.user.name, cur);
  }
  const chalkStats: LeanStat[] = Array.from(chalkByUser.entries())
    .map(([name, { chalk, count }]) => ({ name, pct: (chalk / count) * 100, count }))
    .filter((s) => s.count >= MIN_PICKS_FOR_LEAN);
  const chalkLover = chalkStats.length > 0 ? chalkStats.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const contrarian = chalkStats.length > 0 ? chalkStats.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;

  // --- Home Cookin': % of SPREAD picks taken on the home team ---
  const homeByUser = new Map<string, { home: number; count: number }>();
  for (const p of spreadPicks) {
    const isHome = p.selection === p.game.homeTeam;
    const cur = homeByUser.get(p.user.name) ?? { home: 0, count: 0 };
    cur.count++;
    if (isHome) cur.home++;
    homeByUser.set(p.user.name, cur);
  }
  const homeStats: LeanStat[] = Array.from(homeByUser.entries())
    .map(([name, { home, count }]) => ({ name, pct: (home / count) * 100, count }))
    .filter((s) => s.count >= MIN_PICKS_FOR_LEAN);
  const homeCookin = homeStats.length > 0 ? homeStats.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const roadWarrior = homeStats.length > 0 ? homeStats.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;

  // --- Missed picks: completed weeks (strictly before the current one, so
  // an in-progress week with games still to lock isn't wrongly flagged)
  // where a player locked fewer than the full 5 side/total picks. ---
  const sidePicksByUserWeek = new Map<string, number>();
  for (const p of lockedPicks) {
    const key = `${p.userId}|${p.weekId}`;
    sidePicksByUserWeek.set(key, (sidePicksByUserWeek.get(key) ?? 0) + 1);
  }
  const completedWeeks = weeks.filter((w) => w.weekNumber < currentWeekNumber && w.weekNumber >= 1);
  const missedByUser = new Map<string, number>();
  for (const u of users) missedByUser.set(u.name, 0);
  for (const w of completedWeeks) {
    for (const u of users) {
      const count = sidePicksByUserWeek.get(`${u.id}|${w.id}`) ?? 0;
      if (count < 5) missedByUser.set(u.name, (missedByUser.get(u.name) ?? 0) + 1);
    }
  }
  const missedStats: MissedStat[] = Array.from(missedByUser.entries())
    .map(([name, missedWeeks]) => ({ name, missedWeeks }))
    .sort((a, b) => b.missedWeeks - a.missedWeeks);
  const ghostAward = missedStats.length > 0 && missedStats[0].missedWeeks > 0 ? missedStats[0] : null;

  // --- Flip-Flopper: who changes their mind the most before locking a pick in ---
  const changesByUser = new Map<string, { total: number; count: number }>();
  for (const p of allLockedPicks) {
    const cur = changesByUser.get(p.user.name) ?? { total: 0, count: 0 };
    cur.total += p.selectionChanges;
    cur.count++;
    changesByUser.set(p.user.name, cur);
  }
  const flipFlopStats: FlipFlopStat[] = Array.from(changesByUser.entries())
    .map(([name, { total, count }]) => ({ name, avgChanges: total / count, totalChanges: total, count }))
    .filter((s) => s.count >= MIN_PICKS_FOR_LEAN);
  const flipFlopper =
    flipFlopStats.length > 0 && flipFlopStats.some((s) => s.totalChanges > 0)
      ? flipFlopStats.reduce((a, b) => (b.avgChanges > a.avgChanges ? b : a))
      : null;

  // --- Quick Draw / Ponderer: minutes between first selecting a pick
  // (createdAt, set on the first autosave) and actually locking it in. Not
  // pure "thinking time" for someone who selects a game weeks ahead and
  // locks it later, but a fun proxy regardless. ---
  const deliberationByUser = new Map<string, number[]>();
  for (const p of allLockedPicks) {
    if (!p.lockedAt) continue;
    const minutes = (p.lockedAt.getTime() - p.createdAt.getTime()) / 60000;
    if (minutes < 0) continue; // defensive - shouldn't happen
    const arr = deliberationByUser.get(p.user.name) ?? [];
    arr.push(minutes);
    deliberationByUser.set(p.user.name, arr);
  }
  const deliberationStats: DeliberationStat[] = Array.from(deliberationByUser.entries())
    .map(([name, arr]) => ({ name, avgMinutes: arr.reduce((a, b) => a + b, 0) / arr.length, count: arr.length }))
    .filter((s) => s.count >= MIN_PICKS_FOR_LEAN);
  const quickDraw =
    deliberationStats.length > 0
      ? deliberationStats.reduce((a, b) => (b.avgMinutes < a.avgMinutes ? b : a))
      : null;
  const ponderer =
    deliberationStats.length > 0
      ? deliberationStats.reduce((a, b) => (b.avgMinutes > a.avgMinutes ? b : a))
      : null;

  return {
    earlyBird,
    lastSecondLarry,
    buzzerBeater,
    overLover,
    underLover,
    groupOverPct,
    chalkLover,
    contrarian,
    ghostAward,
    flipFlopper,
    homeCookin,
    roadWarrior,
    quickDraw,
    ponderer,
  };
}
