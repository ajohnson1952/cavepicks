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

export function findEspnTeamInfo(oddsApiTeamName: string, teams: EspnTeamInfo[]): EspnTeamInfo | null {
  return bestNameMatch(oddsApiTeamName, teams, (t) => t.location);
}
