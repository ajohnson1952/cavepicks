// Builds the copy-paste-to-iMessage pick list shown behind the "copy picks"
// link on the Board. One line per pick, picked team first with its number,
// separator carries home/away:  "@" = picked team is the visitor,
// "v" = picked team is hosting.
//   SMU -3.5 @ FSU        (took the away favorite)
//   FSU -3.5 v SMU        (took the home favorite)
//   Tulane v Memphis o52.5   (took the over - no team "picked", away v home)
//   Wisc +20.5 ML @ ND (dog)
// Line is the frozen one once locked, otherwise the current live line.
import { formatSpread } from "./format";

type ShareSnapshot = {
  spreadHome: number | null;
  spreadAway: number | null;
  total: number | null;
  underdogTeam: string | null;
};

type ShareGame = {
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string | null;
  awayAbbr: string | null;
  voided: boolean;
  oddsSnapshots: ShareSnapshot[];
};

export type SharePick = {
  pickType: "SPREAD" | "TOTAL" | "DOG";
  selection: string;
  lockedLine: number | null;
  dogSpreadValue: number | null;
  game: ShareGame;
};

function abbrs(g: ShareGame) {
  return { home: g.homeAbbr ?? g.homeTeam, away: g.awayAbbr ?? g.awayTeam };
}

function formatSide(p: SharePick): string {
  const g = p.game;
  const { home, away } = abbrs(g);
  const snap = g.oddsSnapshots[0] ?? null;

  if (p.pickType === "TOTAL") {
    const line = p.lockedLine ?? snap?.total ?? null;
    const ou = p.selection === "over" ? "o" : "u";
    const tail = line != null ? ` ${ou}${line}` : ` ${p.selection}`;
    return `${away} v ${home}${tail}`;
  }

  // SPREAD
  const isHome = p.selection === g.homeTeam;
  const picked = isHome ? home : away;
  const other = isHome ? away : home;
  let line = p.lockedLine;
  if (line == null && snap) line = isHome ? snap.spreadHome : snap.spreadAway;
  const num = line != null ? ` ${formatSpread(line)}` : "";
  return `${picked}${num} ${isHome ? "v" : "@"} ${other}`;
}

function formatDog(p: SharePick): string {
  const g = p.game;
  const { home, away } = abbrs(g);
  const snap = g.oddsSnapshots[0] ?? null;
  const isHome = p.selection === g.homeTeam;
  const picked = isHome ? home : away;
  const other = isHome ? away : home;

  let worth = p.dogSpreadValue;
  if (worth == null && snap) {
    const s = isHome ? snap.spreadHome : snap.spreadAway;
    worth = s != null ? Math.abs(s) : null;
  }
  const num = worth != null ? ` +${worth}` : "";
  return `${picked}${num} ML ${isHome ? "v" : "@"} ${other} (dog)`;
}

/** Empty string when the player has no (non-voided) picks. */
export function buildPickShareText(
  name: string,
  weekNumber: number,
  sidePicks: SharePick[],
  dogPick: SharePick | null
): string {
  const lines = sidePicks.filter((p) => !p.game.voided).map(formatSide);
  if (dogPick && !dogPick.game.voided) lines.push(formatDog(dogPick));
  if (lines.length === 0) return "";
  return `${name} — Week ${weekNumber}\n${lines.join("\n")}`;
}
