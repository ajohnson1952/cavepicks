// lib/espnScores.ts
// Pulls the public (unofficial, no key needed) ESPN scoreboard for a given
// date and returns finished games with scores. No rate limit documented,
// treat as "usually reliable, no SLA" - this is not officially supported by ESPN.

export type EspnResult = {
  homeTeam: string; // ESPN's "location" name, e.g. "Ohio State"
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  completed: boolean;
  dateISO: string;
};

export async function fetchEspnScoreboard(yyyymmdd: string): Promise<EspnResult[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${yyyymmdd}`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  const events = data.events ?? [];

  const results: EspnResult[] = [];
  for (const event of events) {
    const competition = event.competitions?.[0];
    if (!competition) continue;

    const home = competition.competitors?.find((c: any) => c.homeAway === "home");
    const away = competition.competitors?.find((c: any) => c.homeAway === "away");
    if (!home || !away) continue;

    results.push({
      homeTeam: home.team?.location ?? home.team?.displayName ?? "",
      awayTeam: away.team?.location ?? away.team?.displayName ?? "",
      homeScore: Number(home.score ?? 0),
      awayScore: Number(away.score ?? 0),
      completed: competition.status?.type?.completed === true,
      dateISO: event.date,
    });
  }
  return results;
}

// Fuzzy match: does the ESPN school name (e.g. "Ohio State") appear inside
// our stored team name (e.g. "Ohio State Buckeyes" from the odds API), or
// vice versa. Good enough for FBS matchups; case-insensitive.
export function teamNamesMatch(oddsApiName: string, espnName: string): boolean {
  const a = oddsApiName.toLowerCase().trim();
  const b = espnName.toLowerCase().trim();
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export function toYyyymmdd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}
