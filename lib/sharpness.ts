// "Sharp Report" - who's sharp, who's square. Shared by /history's Sharp
// Report card and the read-only /api/debug-sharpness endpoint.
//
// Per player, from locked 2026 side picks (weeks 1+):
//   - results: W-L-P and win % on graded picks
//   - closing line value (CLV): the line they locked vs the game's CLOSING
//     line (its newest OddsSnapshot - pullOdds only ever writes pre-kickoff
//     snapshots, so the newest one is the close), in points from the
//     picker's side; + = they got a better number than the close.
//       spread: lockedLine - closing line for the same team (took +7, closed +5 -> +2)
//       over:   close - locked          under: locked - close
//     CLV is the standard sharp yardstick - it rewards getting good numbers
//     long before results have enough sample to mean anything.
//   - tendencies (favorites vs dogs, overs vs unders) and dog-pick results
//
// Sharp score (for ranking only - just for fun):
//   (win% - 50) / 10   results
// + avg CLV x 4        process (a point of CLV is worth a lot)
// + dog points / 10    small bonus for hitting Cavedogs
import { prisma } from "./db";

export type SharpPlayer = {
  name: string;
  sidePicks: number;
  wins: number;
  losses: number;
  pushes: number;
  winPct: number | null;
  avgClv: number | null;
  beatClosePct: number | null;
  matchedClosePct: number | null;
  clvSample: number;
  favorites: number;
  underdogs: number;
  overs: number;
  unders: number;
  dogPicks: number;
  dogWins: number;
  dogPoints: number;
  // picks where the-yahngorithm's model also had a pick on that game + market
  // (lib/ghost.ts ModelPick): how the player did siding WITH it vs AGAINST it
  withModel: { picks: number; wins: number; losses: number };
  againstModel: { picks: number; wins: number; losses: number };
  score: number;
  tags: string[];
};

// Below this many graded side picks a player isn't ranked yet.
export const MIN_SHARP_SAMPLE = 10;

function tagsFor(p: Omit<SharpPlayer, "score" | "tags">): string[] {
  const t: string[] = [];
  const sideDecided = p.favorites + p.underdogs;
  const totals = p.overs + p.unders;
  if (p.avgClv != null && p.winPct != null) {
    if (p.avgClv <= -0.4 && p.winPct >= 52) t.push("🔥 Running hot");
    if (p.avgClv >= 0.1 && p.winPct < 48) t.push("🍀 Due for a heater");
  }
  if (p.winPct != null && p.wins + p.losses >= MIN_SHARP_SAMPLE && p.winPct <= 35) t.push("🧱 Ice cold");
  if (p.beatClosePct != null && p.beatClosePct >= 30) t.push("⏱️ Beats the close");
  if (p.avgClv != null && p.avgClv <= -0.4) t.push("🐌 Buys stale numbers");
  if (sideDecided >= 8 && p.favorites / sideDecided >= 0.7) t.push("🍔 Chalk eater");
  if (sideDecided >= 8 && p.underdogs / sideDecided >= 0.6) t.push("🐶 Takes the points");
  if (totals >= 4 && p.overs / totals >= 0.75) t.push("📈 Over lover");
  if (totals >= 4 && p.unders / totals >= 0.75) t.push("🧊 Under hunter");
  const overlap = p.withModel.picks + p.againstModel.picks;
  if (overlap >= 6 && p.withModel.picks / overlap >= 0.7) t.push("🤖 Rides with Yahngo");
  if (overlap >= 6 && p.againstModel.picks / overlap >= 0.7) t.push("🙅 Fades Yahngo");
  if (p.dogWins >= 3) t.push("🐕 Dog whisperer");
  if (p.dogPicks >= 4 && p.dogWins === 0) t.push("🦴 Dog starved");
  return t;
}

export async function computeSharpness(seasonYear: number): Promise<SharpPlayer[]> {
  const picks = await prisma.pick.findMany({
    where: { locked: true, week: { seasonYear, weekNumber: { gte: 1 } } },
    include: {
      user: true,
      game: { include: { oddsSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 } } },
    },
  });

  type Acc = {
    name: string;
    sides: number;
    wins: number;
    losses: number;
    pushes: number;
    clvSum: number;
    clvCount: number;
    beatClose: number;
    matchedClose: number;
    favorites: number;
    underdogs: number;
    overs: number;
    unders: number;
    dogPicks: number;
    dogWins: number;
    dogPoints: number;
    withModel: { picks: number; wins: number; losses: number };
    againstModel: { picks: number; wins: number; losses: number };
  };
  // the model's side per game + market, as of that game's lock deadline.
  // Never let this optional extra break the Sharp Report.
  const modelPicks = await prisma.modelPick
    .findMany({ where: { week: { seasonYear, weekNumber: { gte: 1 } } }, select: { gameId: true, pickType: true, selection: true } })
    .catch(() => []);
  const modelSide = new Map(modelPicks.map((m) => [`${m.gameId}_${m.pickType}`, m.selection]));
  const by = new Map<string, Acc>();
  const get = (name: string) => {
    let a = by.get(name);
    if (!a) {
      a = {
        name,
        sides: 0, wins: 0, losses: 0, pushes: 0,
        clvSum: 0, clvCount: 0, beatClose: 0, matchedClose: 0,
        favorites: 0, underdogs: 0, overs: 0, unders: 0,
        dogPicks: 0, dogWins: 0, dogPoints: 0,
        withModel: { picks: 0, wins: 0, losses: 0 },
        againstModel: { picks: 0, wins: 0, losses: 0 },
      };
      by.set(name, a);
    }
    return a;
  };

  for (const p of picks) {
    const a = get(p.user.name);
    if (p.pickType === "DOG") {
      a.dogPicks++;
      if (p.graded && p.isWin) {
        a.dogWins++;
        a.dogPoints += p.pointsEarned;
      }
      continue;
    }
    a.sides++;
    if (p.graded) {
      if (p.isPush) a.pushes++;
      else if (p.isWin) a.wins++;
      else a.losses++;
    }
    const model = modelSide.get(`${p.gameId}_${p.pickType}`);
    if (model) {
      const bucket = model.toLowerCase() === p.selection.toLowerCase() ? a.withModel : a.againstModel;
      bucket.picks++;
      if (p.graded && !p.isPush) {
        if (p.isWin) bucket.wins++;
        else bucket.losses++;
      }
    }
    if (p.pickType === "TOTAL") {
      if (p.selection === "over") a.overs++;
      else a.unders++;
    } else if (p.lockedLine != null) {
      if (p.lockedLine < 0) a.favorites++;
      else a.underdogs++;
    }

    const close = p.game.oddsSnapshots[0];
    if (!close || p.lockedLine == null) continue;
    let clv: number | null = null;
    if (p.pickType === "SPREAD") {
      const closeLine = p.selection === p.game.homeTeam ? close.spreadHome : close.spreadAway;
      if (closeLine != null) clv = p.lockedLine - closeLine;
    } else if (close.total != null) {
      clv = p.selection === "over" ? close.total - p.lockedLine : p.lockedLine - close.total;
    }
    if (clv == null) continue;
    a.clvSum += clv;
    a.clvCount++;
    if (clv > 0) a.beatClose++;
    if (clv === 0) a.matchedClose++;
  }

  const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

  return Array.from(by.values())
    .map((a) => {
      const decided = a.wins + a.losses;
      const base = {
        name: a.name,
        sidePicks: a.sides,
        wins: a.wins,
        losses: a.losses,
        pushes: a.pushes,
        winPct: decided ? round((a.wins / decided) * 100, 1) : null,
        avgClv: a.clvCount ? round(a.clvSum / a.clvCount, 2) : null,
        beatClosePct: a.clvCount ? round((a.beatClose / a.clvCount) * 100, 1) : null,
        matchedClosePct: a.clvCount ? round((a.matchedClose / a.clvCount) * 100, 1) : null,
        clvSample: a.clvCount,
        favorites: a.favorites,
        underdogs: a.underdogs,
        overs: a.overs,
        unders: a.unders,
        dogPicks: a.dogPicks,
        dogWins: a.dogWins,
        dogPoints: a.dogPoints,
        withModel: a.withModel,
        againstModel: a.againstModel,
      };
      const score = round(
        ((base.winPct ?? 50) - 50) / 10 + (base.avgClv ?? 0) * 4 + base.dogPoints / 10,
        2
      );
      return { ...base, score, tags: tagsFor(base) };
    })
    .sort((x, y) => y.score - x.score);
}
