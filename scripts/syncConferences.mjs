// npm run sync-conferences
// Builds lib/conferenceIds.ts - every FBS and FCS team's conference, from
// ESPN's public standings feed - so the player pages can split picks by
// conference without any runtime call. Run it once a season (conference
// realignment), then commit + push lib/conferenceIds.ts like any other change.
import { writeFileSync } from "node:fs";

const SEASON = Number(process.argv[2]) || new Date().getFullYear();

// ESPN abbreviations -> the short labels the site shows
const SHORT = {
  sec: "SEC", big10: "Big Ten", big12: "Big 12", acc: "ACC", American: "American",
  usa: "C-USA", midam: "MAC", mwest: "Mountain West", pac12: "Pac-12", belt: "Sun Belt",
  ind: "FBS Indep.",
};

async function level(group, division) {
  const url = `https://site.api.espn.com/apis/v2/sports/football/college-football/standings?group=${group}&season=${SEASON}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN standings ${group} answered ${res.status}`);
  const data = await res.json();
  const out = [];
  for (const conf of data.children ?? []) {
    const label = SHORT[conf.abbreviation] ?? conf.shortName ?? conf.name;
    // some conferences (Sun Belt, SWAC) nest their teams one level down, by division
    const blocks = [conf, ...(conf.children ?? [])];
    for (const b of blocks) {
      for (const e of b.standings?.entries ?? []) {
        out.push({ id: Number(e.team.id), name: e.team.displayName, short: e.team.location ?? e.team.shortDisplayName ?? e.team.displayName, conf: label, division });
      }
    }
  }
  return out;
}

const teams = [...(await level(80, "FBS")), ...(await level(81, "FCS"))];
const byId = new Map(teams.map((t) => [t.id, t]));
if (byId.size < 200) throw new Error(`only ${byId.size} teams came back - ESPN feed looks wrong, not writing`);

const rows = [...byId.values()]
  .sort((a, b) => a.id - b.id)
  .map((t) => `  [${t.id}, ${JSON.stringify(t.conf)}, ${JSON.stringify(t.name)}, ${JSON.stringify(t.division)}, ${JSON.stringify(t.short)}],`);

writeFileSync(
  new URL("../lib/conferenceIds.ts", import.meta.url),
  `// Every FBS/FCS team's conference: [ESPN team id, conference, ESPN name, level, school name].
// Built from ESPN's public standings by \`npm run sync-conferences\` - run it
// once a season for realignment, then commit + push this file. Nothing reads
// ESPN for this at runtime. Lookups: lib/conferences.ts.
// Season ${SEASON}, synced ${new Date().toISOString().slice(0, 10)} (${byId.size} teams)
export const CONFERENCE_ROWS: ReadonlyArray<readonly [number, string, string, "FBS" | "FCS", string]> = [
${rows.join("\n")}
];
`
);
const confs = new Set(teams.map((t) => t.conf));
console.log(`lib/conferenceIds.ts: ${byId.size} teams in ${confs.size} conferences`);
