// app/api/debug-sharpness/route.ts
// Read-only: who's "sharp"? Per player, for 2026 locked side picks (weeks 1+):
//   - results: W-L-P and win % (graded picks)
//   - closing line value (CLV): how the line they locked compares to the
//     game's CLOSING line (its last OddsSnapshot - pullOdds only ever writes
//     pre-kickoff snapshots, so the newest one is the close). Measured in
//     points from the picker's side, + = they got a better number than the
//     close. Spread: lockedLine - closing line for the same team (took +7,
//     closed +5 -> +2). Over: close - locked. Under: locked - close.
//   - dog picks: record and points
// CLV is the standard "sharp" yardstick - it shows skill at getting good
// numbers well before results have enough sample to mean much.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const picks = await prisma.pick.findMany({
    where: { locked: true, week: { seasonYear: 2026, weekNumber: { gte: 1 } } },
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
    favCount: number;
    dogSideCount: number;
    overs: number;
    unders: number;
    dogPicks: number;
    dogWins: number;
    dogPoints: number;
  };
  const by = new Map<string, Acc>();
  const get = (name: string) => {
    let a = by.get(name);
    if (!a) {
      a = {
        name,
        sides: 0, wins: 0, losses: 0, pushes: 0,
        clvSum: 0, clvCount: 0, beatClose: 0, matchedClose: 0,
        favCount: 0, dogSideCount: 0, overs: 0, unders: 0,
        dogPicks: 0, dogWins: 0, dogPoints: 0,
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
    if (p.pickType === "TOTAL") {
      if (p.selection === "over") a.overs++;
      else a.unders++;
    } else if (p.lockedLine != null) {
      if (p.lockedLine < 0) a.favCount++;
      else a.dogSideCount++;
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

  const players = Array.from(by.values())
    .map((a) => {
      const decided = a.wins + a.losses;
      return {
        name: a.name,
        sidePicks: a.sides,
        record: `${a.wins}-${a.losses}-${a.pushes}`,
        winPct: decided ? Math.round((a.wins / decided) * 1000) / 10 : null,
        avgClv: a.clvCount ? Math.round((a.clvSum / a.clvCount) * 100) / 100 : null,
        beatClosePct: a.clvCount ? Math.round((a.beatClose / a.clvCount) * 1000) / 10 : null,
        matchedClosePct: a.clvCount ? Math.round((a.matchedClose / a.clvCount) * 1000) / 10 : null,
        clvSample: a.clvCount,
        favorites: a.favCount,
        underdogs: a.dogSideCount,
        overs: a.overs,
        unders: a.unders,
        dog: `${a.dogWins}/${a.dogPicks} hit, ${a.dogPoints} pts`,
      };
    })
    .sort((x, y) => (y.avgClv ?? -99) - (x.avgClv ?? -99));

  return NextResponse.json({ ok: true, players });
}
