// lib/format.ts

// Spreads need an explicit + on positive values (underdog) - negative
// numbers already carry their own "-" from JS, but positive ones don't
// get a "+" unless we add it ourselves. Use this anywhere a spread number
// (live or locked) is displayed, so it can't drift out of sync per-page.
export function formatSpread(value: number | null | undefined): string {
  if (value == null) return "?";
  return value > 0 ? `+${value}` : `${value}`;
}

// American odds/juice always show an explicit sign - e.g. -110, +150.
export function formatOdds(value: number | null | undefined): string {
  if (value == null) return "";
  return value > 0 ? `+${value}` : `${value}`;
}

// The Odds API bookmaker keys -> display names. A line can come from any book
// in BOOK_PREFERENCE (lib/lock.ts) depending on which one had the game posted
// when it was pulled or locked - show which, for transparency.
const BOOK_LABELS: Record<string, string> = {
  fanduel: "FanDuel",
  draftkings: "DraftKings",
  betmgm: "BetMGM",
};
export function bookLabel(key: string | null | undefined): string {
  if (!key) return "";
  return BOOK_LABELS[key] ?? key;
}

// Same idea as BOOK_LABELS but short enough for tight spaces like the Board.
const BOOK_ABBR: Record<string, string> = {
  fanduel: "FD",
  draftkings: "DK",
  betmgm: "MGM",
};
export function bookAbbr(key: string | null | undefined): string {
  if (!key) return "";
  return BOOK_ABBR[key] ?? key;
}
