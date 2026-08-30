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
