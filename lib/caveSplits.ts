// lib/caveSplits.ts
// "How the cave picked it": for one week, how many LOCKED picks sit on each
// side of each game. Counts only - no names, no lines, and nothing that isn't
// locked (an unlocked pick is still private to its player). The owner's model
// site, the-yahngorithm, shows these next to its own number
// (/api/cave-splits is what it reads).
//
// Cached, and refreshed ONLY when a pick is locked or unlocked
// (bumpCaveSplits below) - never on a timer. The yahngorithm asks for this
// every ~30 minutes, and an uncached version would wake the database each
// time (see the Neon note in CLAUDE.md).
import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "./db";
import { SEASON_YEAR } from "./currentWeek";

const TAG = "cave-splits";

export type CaveSplitGame = {
  home: string; // Odds API team names, same as Game.homeTeam / awayTeam
  away: string;
  players: number; // how many different players have a locked pick on this game
  spread: { home: number; away: number };
  total: { over: number; under: number };
  dog: { home: number; away: number };
};

async function build(weekNumber: number): Promise<{ week: number; leagueSize: number; games: CaveSplitGame[] }> {
  const [week, leagueSize] = await Promise.all([
    prisma.week.findUnique({ where: { seasonYear_weekNumber: { seasonYear: SEASON_YEAR, weekNumber } } }),
    prisma.user.count(),
  ]);
  if (!week) return { week: weekNumber, leagueSize, games: [] };

  const picks = await prisma.pick.findMany({
    where: { weekId: week.id, locked: true, game: { voided: false } },
    select: { userId: true, pickType: true, selection: true, game: { select: { id: true, homeTeam: true, awayTeam: true } } },
  });

  const byGame = new Map<string, CaveSplitGame & { users: Set<string> }>();
  for (const p of picks) {
    const g = p.game;
    let e = byGame.get(g.id);
    if (!e) {
      e = {
        home: g.homeTeam, away: g.awayTeam, players: 0, users: new Set(),
        spread: { home: 0, away: 0 }, total: { over: 0, under: 0 }, dog: { home: 0, away: 0 },
      };
      byGame.set(g.id, e);
    }
    e.users.add(p.userId);
    if (p.pickType === "TOTAL") {
      if (p.selection.toLowerCase() === "over") e.total.over++;
      else e.total.under++;
    } else {
      const side = p.selection === g.homeTeam ? "home" : p.selection === g.awayTeam ? "away" : null;
      if (!side) continue;
      if (p.pickType === "SPREAD") e.spread[side]++;
      else e.dog[side]++;
    }
  }

  return {
    week: weekNumber,
    leagueSize,
    games: [...byGame.values()].map(({ users, ...g }) => ({ ...g, players: users.size })),
  };
}

export const getCaveSplits = unstable_cache(build, [TAG], { revalidate: 6 * 3600, tags: [TAG] });

/** Call after anything that locks, unlocks or moves a pick. */
export function bumpCaveSplits() {
  try {
    revalidateTag(TAG, { expire: 0 });
  } catch {
    // outside a request (shouldn't happen) - the 6h backstop covers it
  }
}
