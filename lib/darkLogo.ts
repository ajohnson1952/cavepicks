// ESPN publishes every college logo twice: /500/ for light backgrounds and
// /500-dark/ for dark ones. The site is dark-only, and navy/black logos
// (Utah State, Akron, Nevada, TCU...) vanish on it, so always show the dark
// version. Saved games keep the plain link; this swaps it when drawn.
// (Checked Nov 2026: all 669 teams on ESPN's list have a dark version.)
export function darkLogo(src: string | null): string | null {
  return src ? src.replace("/teamlogos/ncaa/500/", "/teamlogos/ncaa/500-dark/") : null;
}
