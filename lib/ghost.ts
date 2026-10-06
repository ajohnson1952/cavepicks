// lib/ghost.ts
// "Yahngo", the ghost player: the-yahngorithm's model playing Cavepicks by the
// same rules as everyone else - 5 side picks + 1 dog a week, each frozen at
// the line that was on screen at that game's lock deadline (30 min before
// kickoff). Purely for fun: its picks live in GhostPick, never Pick, so no
// pot / payout / ledger / week-settling code ever sees it.
//
// HOW IT DECIDES (decideGhostPicks - a pure function, no database):
// The ghost can't see the future, so it decides game by game, in lock-deadline
// order. At game G's deadline T:
//  - SIDES: line up every model pick that existed by T (logged before T) on a
//    game that hasn't locked yet, biggest edge first. With S of its 5 slots
//    left, it takes the model's pick on G only if that pick is in the top S.
//    Net effect: the 5 biggest edges of the week, without hindsight.
//  - DOG: for every game still to lock, expected points = the model's chance
//    the underdog wins outright x the points the dog is getting (the line as
//    known at T). It takes G's underdog only if G is the best one left.
// Everything it reads is fixed once a deadline passes (pick log times, edges,
// our own odds snapshots), so replaying a week gives the same answer - that's
// what lets one function do both the live sweep and the backfill of past weeks.
import { prisma } from "./db";
import { AUTO_LOCK_MINUTES } from "./lock";
import { gradePick } from "./scoring";
import { SEASON_YEAR, getWeekNumberForDate } from "./currentWeek";
import { YAHN_SITE, type YahnFeed, type YahnGame } from "./yahn";

// "Yahngo", not "Yahn": Yahn is the owner's nickname in the league, and the
// picks are the yahngorithm model's, not his.
export const GHOST_NAME = "Yahngo";
const SIDE_SLOTS = 5;

type Snap = {
  spreadHome: number | null;
  spreadAway: number | null;
  spreadHomePrice: number | null;
  spreadAwayPrice: number | null;
  total: number | null;
  totalOverPrice: number | null;
  totalUnderPrice: number | null;
  mlHome: number | null;
  mlAway: number | null;
  underdogTeam: string | null;
  sourceBook: string | null;
  capturedAt: Date;
};

export type GhostGame = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
  snapshots: Snap[]; // any order
};

export type GhostDecision = {
  gameId: string;
  pickType: "SPREAD" | "TOTAL" | "DOG";
  selection: string;
  lockedLine: number | null;
  lockedOdds: number | null;
  dogSpreadValue: number | null;
  lockedBook: string | null;
  lockedAt: Date;
  yahnEdge: number | null;
  yahnValue: number | null;
};

const deadlineOf = (g: GhostGame) => new Date(g.commenceTime.getTime() - AUTO_LOCK_MINUTES * 60_000);

/** the newest snapshot captured at or before `at` - i.e. the line that was on screen then */
function snapAt(g: GhostGame, at: Date): Snap | null {
  let best: Snap | null = null;
  for (const s of g.snapshots) {
    if (s.capturedAt.getTime() > at.getTime()) continue;
    if (!best || s.capturedAt.getTime() > best.capturedAt.getTime()) best = s;
  }
  return best;
}

function dogOf(g: GhostGame, s: Snap | null): { team: string; points: number; ml: number | null; home: boolean } | null {
  if (!s?.underdogTeam) return null;
  const home = s.underdogTeam === g.homeTeam;
  if (!home && s.underdogTeam !== g.awayTeam) return null;
  const spread = home ? s.spreadHome : s.spreadAway;
  if (spread == null || spread <= 0) return null;
  return { team: s.underdogTeam, points: spread, ml: home ? s.mlHome : s.mlAway, home };
}

/**
 * Replay a week: every pick the ghost locks on games whose deadline is <= now.
 * Pure - give it the week's games (with their odds history) and the
 * yahngorithm feed and it returns the same list every time.
 */
export function decideGhostPicks(games: GhostGame[], feed: YahnFeed, now: Date): GhostDecision[] {
  const feedFor = (g: GhostGame): YahnGame | null =>
    feed.games.find((f) => f.home.oddsNames.includes(g.homeTeam) && f.away.oddsNames.includes(g.awayTeam)) ?? null;

  const ordered = [...games].sort(
    (a, b) => a.commenceTime.getTime() - b.commenceTime.getTime() || a.id.localeCompare(b.id)
  );
  const matched = new Map<string, YahnGame | null>(ordered.map((g) => [g.id, feedFor(g)]));

  // every model side pick on a game we have, tagged with our game
  const allSides = ordered.flatMap((g) =>
    (matched.get(g.id)?.picks ?? [])
      .filter((p) => p.market === "spread" || p.market === "total")
      .map((p) => ({ g, p, key: `${g.id}_${p.market}` }))
  );

  const out: GhostDecision[] = [];
  const takenSides = new Set<string>();
  let dogTaken = false;

  for (const G of ordered) {
    const T = deadlineOf(G);
    if (T.getTime() > now.getTime()) break; // not locked yet - nor is anything after it
    const snapG = snapAt(G, T);

    // ---- sides ----
    const slots = SIDE_SLOTS - takenSides.size;
    if (slots > 0) {
      const candidates = allSides
        .filter(
          (c) =>
            !takenSides.has(c.key) &&
            deadlineOf(c.g).getTime() >= T.getTime() && // still lockable at T
            (!c.p.loggedAt || new Date(c.p.loggedAt).getTime() <= T.getTime()) // the model had made it by T
        )
        .sort(
          (a, b) =>
            b.p.edge - a.p.edge ||
            a.g.commenceTime.getTime() - b.g.commenceTime.getTime() ||
            a.key.localeCompare(b.key)
        );
      candidates.forEach((c, rank) => {
        if (c.g.id !== G.id || rank >= slots || !snapG) return;
        if (c.p.market === "spread") {
          const home = c.p.side === "home";
          const line = home ? snapG.spreadHome : snapG.spreadAway;
          if (line == null) return; // no spread on screen at the deadline - can't lock it
          out.push({
            gameId: G.id, pickType: "SPREAD", selection: home ? G.homeTeam : G.awayTeam,
            lockedLine: line, lockedOdds: home ? snapG.spreadHomePrice : snapG.spreadAwayPrice,
            dogSpreadValue: null, lockedBook: snapG.sourceBook, lockedAt: T,
            yahnEdge: c.p.edge, yahnValue: null,
          });
        } else {
          if (snapG.total == null) return;
          const over = c.p.side === "over";
          out.push({
            gameId: G.id, pickType: "TOTAL", selection: over ? "over" : "under",
            lockedLine: snapG.total, lockedOdds: over ? snapG.totalOverPrice : snapG.totalUnderPrice,
            dogSpreadValue: null, lockedBook: snapG.sourceBook, lockedAt: T,
            yahnEdge: c.p.edge, yahnValue: null,
          });
        }
        takenSides.add(c.key);
      });
    }

    // ---- dog ----
    if (!dogTaken) {
      let best: { g: GhostGame; value: number } | null = null;
      for (const X of ordered) {
        if (deadlineOf(X).getTime() < T.getTime()) continue; // already locked
        const p = matched.get(X.id)?.homeWinProb;
        const dog = dogOf(X, snapAt(X, T)); // the line as known at T
        if (p == null || !dog) continue;
        const value = (dog.home ? p : 1 - p) * dog.points;
        if (!best || value > best.value) best = { g: X, value }; // ties keep the earlier game
      }
      const dogG = dogOf(G, snapG);
      if (best && best.g.id === G.id && dogG && best.value > 0) {
        out.push({
          gameId: G.id, pickType: "DOG", selection: dogG.team,
          lockedLine: null, lockedOdds: dogG.ml, dogSpreadValue: dogG.points,
          lockedBook: snapG?.sourceBook ?? null, lockedAt: T,
          yahnEdge: null, yahnValue: Math.round(best.value * 100) / 100,
        });
        dogTaken = true;
      }
    }
  }
  return out;
}

async function fetchFeed(weekNumber: number): Promise<YahnFeed | null> {
  try {
    const base = process.env.YAHN_URL ?? YAHN_SITE;
    const res = await fetch(`${base}/api/feed?week=${weekNumber}`, {
      cache: "no-store", // a lock decision should use the model's picks as they are right now
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const feed = (await res.json()) as YahnFeed;
    return Array.isArray(feed?.games) ? feed : null;
  } catch {
    return null;
  }
}

/**
 * Lock any ghost picks that are due and grade any that have gone final.
 * - Normal run (from grade-results): the current week only, and only picks
 *   whose deadline passed in the last `windowHours` - so a late re-run can
 *   never go back and rewrite an old week.
 * - Backfill: pass explicit `weeks` and `windowHours: null`.
 * `dryRun` reports what it would lock without writing anything.
 */
export async function runGhost(opts: { weeks?: number[]; windowHours?: number | null; dryRun?: boolean } = {}) {
  const now = new Date();
  const windowHours = opts.windowHours === undefined ? 36 : opts.windowHours;
  let weekNumbers = opts.weeks ?? [getWeekNumberForDate(now)];
  // One-time catch-up: the first automatic run after ModelPick was added walks
  // every week so far, so the Sharp Report's "with / against the model" has
  // the whole season. (Ghost picks for old weeks are still protected by the
  // 36h window - this only fills in ModelPick.)
  if (!opts.weeks && !opts.dryRun && (await prisma.modelPick.count()) === 0) {
    weekNumbers = Array.from({ length: getWeekNumberForDate(now) }, (_, i) => i + 1);
  }
  let modelSidesRecorded = 0;
  const locked: { week: number; pick: string }[] = [];
  const notes: string[] = [];

  for (const weekNumber of weekNumbers) {
    if (weekNumber < 1) continue; // Week 0 was test data
    const week = await prisma.week.findUnique({
      where: { seasonYear_weekNumber: { seasonYear: SEASON_YEAR, weekNumber } },
    });
    if (!week) continue;
    const games = await prisma.game.findMany({
      where: { weekId: week.id, voided: false },
      include: { oddsSnapshots: true },
    });
    const feed = await fetchFeed(weekNumber);
    if (!feed) {
      notes.push(`week ${weekNumber}: couldn't reach the yahngorithm feed`);
      continue;
    }

    const decisions = decideGhostPicks(
      games.map((g) => ({
        id: g.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam,
        commenceTime: g.commenceTime, snapshots: g.oddsSnapshots,
      })),
      feed,
      now
    );

    // Record every side the model had picked by each game's deadline (all of
    // them, not just the ghost's 5) - what the Sharp Report compares against.
    const modelRows = games.flatMap((g) => {
      const T = new Date(g.commenceTime.getTime() - AUTO_LOCK_MINUTES * 60_000);
      if (T.getTime() > now.getTime()) return [];
      const fg = feed.games.find((f) => f.home.oddsNames.includes(g.homeTeam) && f.away.oddsNames.includes(g.awayTeam));
      return (fg?.picks ?? [])
        .filter((p) => !p.loggedAt || new Date(p.loggedAt).getTime() <= T.getTime())
        .map((p) => ({
          weekId: week.id,
          gameId: g.id,
          pickType: p.market === "spread" ? ("SPREAD" as const) : ("TOTAL" as const),
          selection: p.market === "spread" ? (p.side === "home" ? g.homeTeam : g.awayTeam) : p.side,
          edge: p.edge,
        }));
    });
    if (!opts.dryRun && modelRows.length) {
      const r = await prisma.modelPick.createMany({ data: modelRows, skipDuplicates: true });
      modelSidesRecorded += r.count;
    }

    const existing = await prisma.ghostPick.findMany({ where: { weekId: week.id } });
    const have = new Set(existing.map((e) => `${e.gameId}_${e.pickType}`));
    let sides = existing.filter((e) => e.pickType !== "DOG").length;
    let hasDog = existing.some((e) => e.pickType === "DOG");
    const gameById = new Map(games.map((g) => [g.id, g]));

    for (const d of decisions) {
      if (have.has(`${d.gameId}_${d.pickType}`)) continue;
      if (windowHours != null && now.getTime() - d.lockedAt.getTime() > windowHours * 3_600_000) continue;
      // belt and braces: the replay already respects these, but never exceed them
      if (d.pickType === "DOG" ? hasDog : sides >= SIDE_SLOTS) continue;

      const g = gameById.get(d.gameId)!;
      const text =
        d.pickType === "DOG"
          ? `DOG ${d.selection} +${d.dogSpreadValue}`
          : d.pickType === "TOTAL"
          ? `${d.selection} ${d.lockedLine} (${g.awayTeam} @ ${g.homeTeam})`
          : `${d.selection} ${d.lockedLine != null && d.lockedLine > 0 ? "+" : ""}${d.lockedLine}`;
      locked.push({ week: weekNumber, pick: text });
      if (d.pickType === "DOG") hasDog = true;
      else sides++;
      if (!opts.dryRun) await prisma.ghostPick.create({ data: { ...d, weekId: week.id } });
    }
  }

  // grade whatever has gone final (any week)
  let graded = 0;
  if (!opts.dryRun) {
    const due = await prisma.ghostPick.findMany({
      where: { graded: false, game: { isFinal: true, voided: false } },
      include: { game: true },
    });
    for (const p of due) {
      const g = p.game;
      if (g.homeScore == null || g.awayScore == null) continue;
      const r = gradePick(
        { homeTeam: g.homeTeam, awayTeam: g.awayTeam, homeScore: g.homeScore, awayScore: g.awayScore },
        { pickType: p.pickType, selection: p.selection, lockedLine: p.lockedLine, dogSpreadValue: p.dogSpreadValue }
      );
      await prisma.ghostPick.update({
        where: { id: p.id },
        data: { graded: true, isWin: r.isWin, isPush: r.isPush, pointsEarned: r.pointsEarned },
      });
      graded++;
    }
  }

  return { ok: true, dryRun: !!opts.dryRun, locked, graded, modelSidesRecorded, notes };
}

/** Season totals for the leaderboards (Week 1 on, graded picks only). */
export async function ghostSeasonStats(seasonYear: number) {
  const picks = await prisma.ghostPick.findMany({
    where: { graded: true, week: { seasonYear, weekNumber: { gte: 1 } } },
    select: { pickType: true, isWin: true, isPush: true, pointsEarned: true },
  });
  const side = { wins: 0, pushes: 0, losses: 0 };
  const dog = { points: 0, wins: 0, losses: 0 };
  for (const p of picks) {
    if (p.pickType === "DOG") {
      dog.points += p.pointsEarned;
      if (p.isWin) dog.wins++;
      else dog.losses++;
    } else if (p.isPush) side.pushes++;
    else if (p.isWin) side.wins++;
    else side.losses++;
  }
  return { side, dog, any: picks.length > 0 };
}
