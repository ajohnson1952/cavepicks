// Team -> conference, from the built-in list in lib/conferenceIds.ts (made by
// `npm run sync-conferences`, never fetched at runtime). A game stores each
// team's ESPN logo link, which carries ESPN's team id - that's the reliable
// match. The team name is the fallback for a game saved without a logo.
import { CONFERENCE_ROWS } from "./conferenceIds";
import { bestNameMatch } from "./espnScores";

type Row = { id: number; conf: string; name: string; level: "FBS" | "FCS" };
const ROWS: Row[] = CONFERENCE_ROWS.map(([id, conf, name, level]) => ({ id, conf, name, level }));
const BY_ID = new Map(ROWS.map((r) => [r.id, r]));
const byName = new Map<string, Row | null>();

function idFromLogo(logo: string | null | undefined): number | null {
  const m = logo?.match(/\/(\d+)\.png/);
  return m ? Number(m[1]) : null;
}

/** The team's conference ("SEC", "Big Sky"...), or null for a team outside
 *  FBS/FCS (D2 and below) or one we can't place. */
export function conferenceOf(team: string, logo?: string | null): { conf: string; level: "FBS" | "FCS" } | null {
  const id = idFromLogo(logo);
  const hit = id != null ? BY_ID.get(id) : undefined;
  if (hit) return { conf: hit.conf, level: hit.level };
  if (!byName.has(team)) byName.set(team, bestNameMatch(team, ROWS, (r) => r.name));
  const r = byName.get(team);
  return r ? { conf: r.conf, level: r.level } : null;
}
