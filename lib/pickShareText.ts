// Builds the copy-paste-to-iMessage pick list shown behind the "copy picks"
// link on the Board. LOCKED picks only - an unlocked pick has no frozen line
// and doesn't count, so it's not something to share. Every line is plain
// "AWAY @ HOME" order; the number (spread, o/u total, or dog ML) sits right
// after whichever team was picked:
//   SMU -3.5 @ FSU          (took the away side)
//   CLEM @ LSU -10.5        (took the home side)
//   Tulane @ Memphis u52.5  (took the under)
//   Wisc +20.5 ML @ ND (dog)
//   ND @ Wisc +20.5 ML (dog)
import { formatSpread } from "./format";

type ShareGame = {
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string | null;
  awayAbbr: string | null;
  voided: boolean;
};

export type SharePick = {
  pickType: "SPREAD" | "TOTAL" | "DOG";
  selection: string;
  locked: boolean;
  lockedLine: number | null;
  dogSpreadValue: number | null;
  game: ShareGame;
};

function abbrs(g: ShareGame) {
  return { home: g.homeAbbr ?? g.homeTeam, away: g.awayAbbr ?? g.awayTeam };
}

// "AWAY @ HOME" with `tail` attached to whichever side was picked.
function awayAtHome(away: string, home: string, pickedHome: boolean, tail: string): string {
  return pickedHome ? `${away} @ ${home}${tail}` : `${away}${tail} @ ${home}`;
}

function formatSide(p: SharePick): string {
  const g = p.game;
  const { home, away } = abbrs(g);
  const isHome = p.selection === g.homeTeam;

  if (p.pickType === "TOTAL") {
    const ou = p.selection === "over" ? "o" : "u";
    return `${away} @ ${home}${p.lockedLine != null ? ` ${ou}${p.lockedLine}` : ` ${p.selection}`}`;
  }
  return awayAtHome(away, home, isHome, p.lockedLine != null ? ` ${formatSpread(p.lockedLine)}` : "");
}

function formatDog(p: SharePick): string {
  const g = p.game;
  const { home, away } = abbrs(g);
  const isHome = p.selection === g.homeTeam;
  const tail = ` ${p.dogSpreadValue != null ? `+${p.dogSpreadValue} ` : ""}ML`;
  return `${awayAtHome(away, home, isHome, tail)} (dog)`;
}

/** Empty string when the player has no locked (non-voided) picks. */
export function buildPickShareText(
  name: string,
  weekNumber: number,
  sidePicks: SharePick[],
  dogPick: SharePick | null
): string {
  const lines = sidePicks.filter((p) => p.locked && !p.game.voided).map(formatSide);
  if (dogPick && dogPick.locked && !dogPick.game.voided) lines.push(formatDog(dogPick));
  if (lines.length === 0) return "";
  return `${name} — Week ${weekNumber}\n${lines.join("\n")}`;
}
