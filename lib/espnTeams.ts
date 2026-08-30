// lib/espnTeams.ts
import { bestNameMatch } from "./espnScores";

export type EspnTeamInfo = {
  location: string; // e.g. "Ohio State"
  abbreviation: string; // e.g. "OSU"
  logo: string | null;
};

// Fetched once per odds pull (not once per game) - this is the full college
// football team list, stable within a season, so one call covers every game
// in the pull. Note: ESPN's groups=80 (FBS) filter does NOT work on this
// /teams endpoint (only on /scoreboard) - it's silently ignored, so instead
// we pull everyone with a high limit and let name matching do the work.
export async function fetchEspnTeams(): Promise<EspnTeamInfo[]> {
  const url = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=900";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];

  const data = await res.json();
  const teams = data.sports?.[0]?.leagues?.[0]?.teams ?? [];

  return teams.map((t: any) => ({
    location: t.team?.location ?? "",
    abbreviation: t.team?.abbreviation ?? "",
    logo: t.team?.logos?.[0]?.href ?? null,
  }));
}

// Teams ESPN's /teams endpoint omits entirely (new programs, some FCS) even
// though they play real games and DO appear on ESPN's /scoreboard. Without
// this they'd render with no logo and no abbreviation. Keyed by the Odds API
// name, lowercased. Logo URL follows ESPN's pattern using the team's own id
// (visible on /scoreboard). Grading still works for these via /scoreboard
// name-matching in espnScores.ts - this is purely for the logo/abbr.
const MANUAL_TEAMS: Record<string, EspnTeamInfo> = {
  "ut rio grande valley vaqueros": {
    location: "UT Rio Grande Valley",
    abbreviation: "RGV",
    logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/292.png",
  },
};

export function findEspnTeamInfo(oddsApiTeamName: string, teams: EspnTeamInfo[]): EspnTeamInfo | null {
  const manual = MANUAL_TEAMS[oddsApiTeamName.toLowerCase().replace(/\s+/g, " ").trim()];
  if (manual) return manual;
  return bestNameMatch(oddsApiTeamName, teams, (t) => t.location);
}
