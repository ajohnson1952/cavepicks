// npm run sync-logos
// Copies the dark-logo picks from the-yahngorithm (/admin/logos there) into
// lib/darkLogoIds.ts, so Cavepicks has its own built-in copy and never asks
// yahn at runtime. Run it after changing picks on yahn, then commit + push
// lib/darkLogoIds.ts like any other change (Vercel redeploys).
import { writeFileSync } from "node:fs";

const res = await fetch("https://the-yahngorithm.com/api/logo-picks");
if (!res.ok) throw new Error(`yahn answered ${res.status}`);
const { dark } = await res.json();
if (!Array.isArray(dark) || !dark.every((n) => Number.isInteger(n))) throw new Error("unexpected list");

const ids = [...new Set(dark)].sort((a, b) => a - b);
const rows = [];
for (let i = 0; i < ids.length; i += 12) rows.push("  " + ids.slice(i, i + 12).join(", ") + ",");
writeFileSync(
  new URL("../lib/darkLogoIds.ts", import.meta.url),
  `// ESPN team ids that show their dark-background logo (see lib/darkLogo.ts).
// Picked on the-yahngorithm's /admin/logos page and copied here by
// \`npm run sync-logos\`, so this site never checks yahn for it. To change a
// logo: pick it on yahn, run the sync, commit + push this file.
// Last synced: ${new Date().toISOString().slice(0, 10)} (${ids.length} teams)
export const DARK_LOGO_IDS: ReadonlySet<number> = new Set([
${rows.join("\n")}
]);
`
);
console.log(`lib/darkLogoIds.ts: ${ids.length} teams on the dark logo`);
