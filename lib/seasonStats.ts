// Computes a live season's weekly-pot results and season-long leaderboard
// stats from real Game/Pick rows. Shared by /standings (which also needs
// weekResults for the pot UI) and /history (which only needs the
// leaderboard stats, to fold the current season into career/all-time
// totals alongside pre-app historical seasons).
import { prisma } from "./db";
import { WEEKLY_BUYIN, resolveWeekPot } from "./pot";
import { getWeekNumberForDate } from "./currentWeek";

export type WeekResult = {
  weekNumber: number;
  potAmount: number;
  leader: string | null;
  rollover: boolean; // true whenever anything rolled (a tie, or nobody scored)
  inProgress: boolean;
  carryIn: number;
  buyIns: number;
  tiedLeaders: string[]; // 2+ names on a tie week, else empty
  payouts: { name: string; amount: number }[];
  carryOut: number;
  houseCut: number;
  standings: { name: string; correct: number }[];
};

export type SideStats = {
  name: string;
  weeksWon: number;
  wins: number;
  pushes: number;
  losses: number;
  pct: number;
};

export type DogStats = {
  name: string;
  points: number;
  wins: number;
  losses: number;
  pct: number;
};

export async function computeCurrentSeasonStats(seasonYear: number) {
  const allWeeks = await prisma.week.findMany({
    where: { seasonYear },
    orderBy: { weekNumber: "asc" },
  });
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const allPicks = await prisma.pick.findMany({ where: { week: { seasonYear } } });
  const allGames = await prisma.game.findMany({ where: { week: { seasonYear } } });

  const currentWeekNumber = getWeekNumberForDate();
  const weeks = allWeeks.filter((w) => w.weekNumber >= 1 && w.weekNumber <= currentWeekNumber);

  const weekResults: WeekResult[] = [];
  let potCarry = 0;

  for (const week of weeks) {
    const weekGames = allGames.filter((g) => g.weekId === week.id);
    const countableGames = weekGames.filter((g) => !g.voided);
    // A week's pot is settled once nothing can change it anymore:
    //  - every game with a LOCKED pick is final (only locked picks count), and
    //  - every game has kicked off, so no one can still lock a new pick.
    // It deliberately does NOT wait on games nobody picked - one unpicked
    // game ESPN never matched ("William and Mary" vs "William & Mary") used
    // to leave a whole week stuck "in progress" with its pot unpaid.
    const lockedGameIds = new Set(
      allPicks.filter((p) => p.weekId === week.id && p.locked).map((p) => p.gameId)
    );
    const now = Date.now();
    const weekFullyGraded =
      countableGames.length > 0 &&
      countableGames.every((g) => g.commenceTime.getTime() <= now) &&
      countableGames.filter((g) => lockedGameIds.has(g.id)).every((g) => g.isFinal);

    const weekPicks = allPicks.filter(
      (p) => p.weekId === week.id && (p.pickType === "SPREAD" || p.pickType === "TOTAL")
    );

    const correctByUser = new Map<string, number>();
    for (const u of users) correctByUser.set(u.id, 0);
    for (const p of weekPicks) {
      if (p.isWin) correctByUser.set(p.userId, (correctByUser.get(p.userId) ?? 0) + 1);
    }

    const standings = users
      .map((u) => ({ name: u.name, correct: correctByUser.get(u.id) ?? 0 }))
      .sort((a, b) => b.correct - a.correct);

    const carryIn = potCarry;
    const buyIns = WEEKLY_BUYIN * users.length;
    const potAmount = carryIn + buyIns;

    let leader: string | null = null;
    let rollover = false;
    let tiedLeaders: string[] = [];
    let payouts: { name: string; amount: number }[] = [];
    let houseCut = 0;

    if (weekFullyGraded) {
      const maxCorrect = Math.max(...standings.map((s) => s.correct));
      const leaders = standings.filter((s) => s.correct === maxCorrect).map((s) => s.name);
      const r = resolveWeekPot({ weekNumber: week.weekNumber, carryIn, buyIns, leaders, maxCorrect });
      payouts = r.payouts;
      houseCut = r.houseCut;
      potCarry = r.carryOut;
      if (leaders.length === 1 && maxCorrect > 0) leader = leaders[0];
      else {
        rollover = true;
        if (maxCorrect > 0) tiedLeaders = leaders;
      }
    }

    weekResults.push({
      weekNumber: week.weekNumber,
      potAmount,
      leader,
      rollover,
      inProgress: !weekFullyGraded,
      carryIn,
      buyIns,
      tiedLeaders,
      payouts,
      carryOut: weekFullyGraded ? potCarry : carryIn,
      houseCut,
      standings,
    });
  }

  const sideTotalPicks = allPicks.filter(
    (p) =>
      (p.pickType === "SPREAD" || p.pickType === "TOTAL") &&
      p.graded &&
      weeks.some((w) => w.id === p.weekId)
  );
  const cavepicksStats: SideStats[] = users
    .map((u) => {
      const userPicks = sideTotalPicks.filter((p) => p.userId === u.id);
      const wins = userPicks.filter((p) => p.isWin === true).length;
      const pushes = userPicks.filter((p) => p.isPush === true).length;
      const losses = userPicks.filter((p) => p.isWin === false && !p.isPush).length;
      const weeksWon = weekResults.filter((w) => w.leader === u.name).length;
      const denom = wins + losses;
      const pct = denom > 0 ? (wins / denom) * 100 : 0;
      return { name: u.name, weeksWon, wins, pushes, losses, pct };
    })
    .sort((a, b) => b.pct - a.pct);

  const dogPicksGraded = allPicks.filter(
    (p) => p.pickType === "DOG" && p.graded && weeks.some((w) => w.id === p.weekId)
  );
  const cavedogsStats: DogStats[] = users
    .map((u) => {
      const userDogPicks = dogPicksGraded.filter((p) => p.userId === u.id);
      const wins = userDogPicks.filter((p) => p.isWin === true).length;
      const losses = userDogPicks.filter((p) => p.isWin === false).length;
      const points = userDogPicks.reduce((sum, p) => sum + (p.isWin ? p.pointsEarned : 0), 0);
      const denom = wins + losses;
      const pct = denom > 0 ? (wins / denom) * 100 : 0;
      return { name: u.name, points, wins, losses, pct };
    })
    .sort((a, b) => b.points - a.points);

  return { users, weeks, currentWeekNumber, weekResults, cavepicksStats, cavedogsStats };
}
