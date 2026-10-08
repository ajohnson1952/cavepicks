// "Line value" for the Board: for a locked pick, the line when we first saw
// the game (open), the line the pick was locked at, and the game's last line -
// its close once it has kicked off, or the current line before that (pullOdds
// only ever writes pre-kickoff snapshots, so the newest one IS the close).
//
// "Open" is OUR first pull that had a number for the game, not the true
// market opener - fine for comparing the cave with each other.
//
// value = points the locked number is better (+) or worse (-) than that last
// line, from the picker's side - the same sign convention as the Sharp
// Report's CLV (lib/sharpness.ts):
//   spread: locked - last, for the picked team (took +7, closed +5 -> +2)
//   over:   last - locked          under: locked - last
//   dog:    points it was worth at lock - points it's worth at the last line
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

type Ends = { spreadHome: number | null; spreadAway: number | null; total: number | null };
export type LinePath = { open: Ends; last: Ends };

type SpreadRow = { gameId: string; spreadHome: number | null; spreadAway: number | null };
type TotalRow = { gameId: string; total: number | null };

// First and newest line per game, in four small "one row per game" lookups
// (DISTINCT ON) - never the whole snapshot history, which is ~100 rows a game
// by Saturday. Spread and total are looked up separately because a book often
// posts one before the other.
export async function getLinePaths(gameIds: string[]): Promise<Map<string, LinePath>> {
  const out = new Map<string, LinePath>();
  const ids = Array.from(new Set(gameIds));
  if (ids.length === 0) return out;
  const inIds = Prisma.join(ids);

  const spread = (dir: Prisma.Sql) => prisma.$queryRaw<SpreadRow[]>`
    SELECT DISTINCT ON ("gameId") "gameId", "spreadHome", "spreadAway"
    FROM "OddsSnapshot"
    WHERE "gameId" IN (${inIds}) AND "spreadHome" IS NOT NULL
    ORDER BY "gameId", "capturedAt" ${dir}`;
  const total = (dir: Prisma.Sql) => prisma.$queryRaw<TotalRow[]>`
    SELECT DISTINCT ON ("gameId") "gameId", "total"
    FROM "OddsSnapshot"
    WHERE "gameId" IN (${inIds}) AND "total" IS NOT NULL
    ORDER BY "gameId", "capturedAt" ${dir}`;

  const [openSpread, lastSpread, openTotal, lastTotal] = await Promise.all([
    spread(Prisma.sql`ASC`),
    spread(Prisma.sql`DESC`),
    total(Prisma.sql`ASC`),
    total(Prisma.sql`DESC`),
  ]);

  const blank = (): Ends => ({ spreadHome: null, spreadAway: null, total: null });
  const get = (id: string) => {
    let p = out.get(id);
    if (!p) out.set(id, (p = { open: blank(), last: blank() }));
    return p;
  };
  for (const r of openSpread) Object.assign(get(r.gameId).open, { spreadHome: r.spreadHome, spreadAway: r.spreadAway });
  for (const r of lastSpread) Object.assign(get(r.gameId).last, { spreadHome: r.spreadHome, spreadAway: r.spreadAway });
  for (const r of openTotal) get(r.gameId).open.total = r.total;
  for (const r of lastTotal) get(r.gameId).last.total = r.total;
  return out;
}

export type LineValue = {
  open: string | null; // display strings, e.g. "+12.5", "48.5", "12.5 pts"
  locked: string;
  last: string;
  lastLabel: "close" | "now";
  value: number;
};

type PickLike = {
  pickType: "SPREAD" | "TOTAL" | "DOG";
  selection: string;
  lockedLine: number | null;
  dogSpreadValue: number | null;
  game: { id: string; homeTeam: string; awayTeam: string; commenceTime: Date; voided: boolean };
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** Null when there's nothing honest to show: voided game, no locked number,
 *  or no line on record for it. */
export function lineValue(p: PickLike, paths: Map<string, LinePath>, now: Date = new Date()): LineValue | null {
  if (p.game.voided) return null;
  const path = paths.get(p.game.id);
  if (!path) return null;
  const lastLabel = p.game.commenceTime.getTime() <= now.getTime() ? "close" : "now";

  if (p.pickType === "TOTAL") {
    if (p.lockedLine == null || path.last.total == null) return null;
    const value = p.selection === "over" ? path.last.total - p.lockedLine : p.lockedLine - path.last.total;
    return {
      open: path.open.total != null ? `${path.open.total}` : null,
      locked: `${p.lockedLine}`,
      last: `${path.last.total}`,
      lastLabel,
      value: r1(value),
    };
  }

  const side = (e: Ends) => (p.selection === p.game.homeTeam ? e.spreadHome : e.spreadAway);
  const last = side(path.last);
  const open = side(path.open);
  if (last == null) return null;

  if (p.pickType === "SPREAD") {
    if (p.lockedLine == null) return null;
    return {
      open: open != null ? signed(open) : null,
      locked: signed(p.lockedLine),
      last: signed(last),
      lastLabel,
      value: r1(p.lockedLine - last),
    };
  }

  // DOG: worth the underdog's spread in points. If the team has since flipped
  // to the favorite it would be worth nothing as a dog now.
  if (p.dogSpreadValue == null) return null;
  const worth = (n: number) => `${Math.max(0, n)} pts`;
  return {
    open: open != null ? worth(open) : null,
    locked: worth(p.dogSpreadValue),
    last: worth(last),
    lastLabel,
    value: r1(p.dogSpreadValue - Math.max(0, last)),
  };
}

export const formatValue = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "±0");
export const valueTone = (v: number) => (v > 0 ? "up" : v < 0 ? "down" : "flat");
