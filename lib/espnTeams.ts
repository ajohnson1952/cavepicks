// lib/espnTeams.ts
import { teamNamesMatch } from "./espnScores";

export type EspnTeamInfo = {
  location: string; // e.g. "Ohio State"
  abbreviation: string; // e.g. "OSU"
  logo: string | null;
};

// Fetched once per odds pull (not once per game) - this is the full FBS
// team list, stable within a season, so one call covers every game in the pull.
export async function fetchEspnTeams(): Promise<EspnTeamInfo[]> {
  const url =
    "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?groups=80&limit=200";
  const res = await fetch(url);
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
  return teams.find((t) => teamNamesMatch(oddsApiTeamName, t.location)) ?? null;
}
