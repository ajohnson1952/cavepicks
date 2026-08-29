// lib/espnScores.ts
// Pulls the public (unofficial, no key needed) ESPN scoreboard for a given
// date and returns finished games with scores. No rate limit documented,
// treat as "usually reliable, no SLA" - this is not officially supported by ESPN.

export type EspnResult = {
  homeTeam: string; // ESPN's "location" name, e.g. "Ohio State"
  awayTeam: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  completed: boolean;
  dateISO: string;
};

// The Odds API and ESPN are two separate vendors with their own internal
// team IDs - there's no shared standardized identifier between them. This
// alias table patches known cases where their naming diverges enough that
// simple substring matching would fail or collide (e.g. two "Miami"s).
// Add to this as real mismatches turn up - see the unmatched[] diagnostic
// in the grading route for how to spot them.
const NAME_ALIASES: Record<string, string> = {
  "miami (oh)": "miami",
  "miami (fl)": "miami",
  "louisiana-monroe": "ul monroe",
  "louisiana": "louisiana lafayette",
  "appalachian state": "app state",
  "pitt": "pittsburgh",
  "ul lafayette": "louisiana",
  "umass": "massachusetts",
  "liu": "long island university",
  "youngstown st": "youngstown state",
  "citadel": "the citadel",
  "ut rio grande valley": "utrgv",
};

function cleanBase(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents: San Jose State -> San Jose State
    .toLowerCase()
    .trim()
    .replace(/['\u2019]/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

// Aliases only ever apply to the odds API side of the comparison - applying
// them to both sides caused double-replacement bugs (e.g. "the citadel"
// getting the "citadel" alias re-applied to become "the the citadel").
function applyAliases(cleaned: string): string {
  for (const [key, value] of Object.entries(NAME_ALIASES)) {
    const pattern = new RegExp(`\\b${key}\\b`);
    if (pattern.test(cleaned)) return cleaned.replace(pattern, value);
  }
  return cleaned;
}

export function teamNamesMatch(oddsApiName: string, espnName: string): boolean {
  const a = applyAliases(cleanBase(oddsApiName));
  const b = cleanBase(espnName);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

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
      homeAbbr: home.team?.abbreviation ?? "",
      awayAbbr: away.team?.abbreviation ?? "",
      homeScore: Number(home.score ?? 0),
      awayScore: Number(away.score ?? 0),
      completed: competition.status?.type?.completed === true,
      dateISO: event.date,
    });
  }
  return results;
}

export function toYyyymmdd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}
