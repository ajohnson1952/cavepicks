// ESPN publishes every college logo twice: /500/ (standard) and /500-dark/
// (made for dark backgrounds). The dark one rescues navy/black logos (Akron,
// Utah State...) but turns plenty of others plain white, so it's a per-team
// pick, made on the-yahngorithm's /admin/logos page and read here through
// getLogoPicks() in lib/yahn.ts. Saved games keep the standard link; this
// swaps it when drawn.

/** The ESPN team id in a logo link (".../500/2006.png" -> 2006). */
function espnId(src: string): number | null {
  const m = src.match(/\/(\d+)\.png/);
  return m ? Number(m[1]) : null;
}

/** The logo to show: the dark-background version if that team was picked
 *  for it, otherwise the standard one. */
export function logoFor(src: string | null, darkIds: Set<number>): string | null {
  if (!src) return null;
  const id = espnId(src);
  return id != null && darkIds.has(id)
    ? src.replace("/teamlogos/ncaa/500/", "/teamlogos/ncaa/500-dark/")
    : src;
}
