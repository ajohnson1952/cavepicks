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
  broadcast: string | null;
  state: "pre" | "in" | "post" | string;
  statusDetail: string | null; // ESPN's short status, e.g. "3:24 - 3rd", "Halftime", "Final"
};

// The Odds API and ESPN are two separate vendors with their own internal
// team IDs - there's no shared standardized identifier between them. This
// alias table patches known cases where their naming diverges enough that
// even the word-overlap matcher below can't bridge them on its own.
// IMPORTANT: keys should be the FULL distinguishing phrase, not a single
// generic word - "louisiana" alone previously matched inside "Louisiana
// Tech Bulldogs" too, silently corrupting an unrelated team's name. (A bare
// single word is only OK when every team name on either side that contains
// it belongs to the same school - e.g. "albany".)
// Keys are matched against the Odds API name; values must be a real ESPN
// team name (or a substring of one) - never invent a value ESPN won't have.
const NAME_ALIASES: Record<string, string> = {
  "miami (oh)": "miami",
  "miami (fl)": "miami",
  "louisiana-monroe": "ul monroe",
  // NOTE: "Louisiana Ragin Cajuns" (the Odds API name) needs NO alias - its
  // words already cover ESPN's plain "Louisiana" and nothing else. It used to
  // be mapped to "louisiana lafayette", which injected the word "lafayette"
  // and made it collide with the real, unrelated school "Lafayette" (Leopards,
  // abbr LAF) - that was the "shows as LAF" bug.
  //
  // ESPN lists Southeastern Louisiana as "SE Louisiana" - "se" and
  // "southeastern" don't share a token, so without this the odds name
  // "Southeastern Louisiana Lions" collapsed onto plain "Louisiana".
  "southeastern louisiana": "se louisiana",
  // The Odds API sends bare "Albany"; ESPN has "UAlbany" and the unrelated
  // D-II "Albany State". Bare "Albany" matched neither cleanly.
  "albany": "ualbany",
  // School rebranded Houston Baptist -> Houston Christian; the odds feed
  // still uses the old name, so it was collapsing onto "Houston" (Cougars).
  "houston baptist": "houston christian",
  "appalachian state": "app state",
  "pitt": "pittsburgh",
  "ul lafayette": "louisiana",
  "umass": "massachusetts",
  "liu": "long island university",
  "youngstown st": "youngstown state",
  "citadel": "the citadel",
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

// Splits into words on both spaces AND hyphens, so "Arkansas-Pine Bluff"
// tokenizes the same way as "Arkansas Pine Bluff" regardless of which
// punctuation either data source happens to use.
function tokenize(name: string): string[] {
  return cleanBase(name)
    .split(/[\s-]+/)
    .filter(Boolean);
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

// Word-overlap match: a candidate only counts if EVERY one of its words
// appears as a whole word somewhere in the odds name. This is structurally
// safer than plain substring containment, which let short names wrongly win
// against longer, unrelated ones just by being a character-level prefix
// (e.g. "Arkansas" matching inside "Arkansas Pine Bluff Golden Lions", or
// "Albany" matching inside the ENTIRELY DIFFERENT school "Albany State").
function fullWordCoverageScore(oddsTokens: string[], candidateTokens: string[]): number {
  if (candidateTokens.length === 0) return -1;
  const allPresent = candidateTokens.every((t) => oddsTokens.includes(t));
  return allPresent ? candidateTokens.length : -1;
}

export function teamNamesMatch(oddsApiName: string, espnName: string): boolean {
  const a = applyAliases(cleanBase(oddsApiName));
  const b = cleanBase(espnName);
  if (!a || !b) return false;
  if (a === b) return true;
  const oddsTokens = tokenize(a);
  const espnTokens = tokenize(b);
  return fullWordCoverageScore(oddsTokens, espnTokens) > 0 || fullWordCoverageScore(espnTokens, oddsTokens) > 0;
}

// Generic "find the right one" matcher: an exact name match always wins.
// Otherwise, picks whichever candidate has full word coverage AND the most
// words (most specific) - not just whichever is a character substring.
export function bestNameMatch<T>(
  oddsApiName: string,
  candidates: T[],
  getName: (item: T) => string
): T | null {
  const a = applyAliases(cleanBase(oddsApiName));
  if (!a) return null;

  const exact = candidates.find((c) => cleanBase(getName(c)) === a);
  if (exact) return exact;

  const oddsTokens = tokenize(a);
  let best: T | null = null;
  let bestScore = 0;

  for (const c of candidates) {
    const candidateTokens = tokenize(getName(c));
    const score = fullWordCoverageScore(oddsTokens, candidateTokens);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return best;
}

export async function fetchEspnScoreboard(yyyymmdd: string): Promise<EspnResult[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${yyyymmdd}`;
  const res = await fetch(url, { cache: "no-store" });
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
      broadcast: competition.broadcasts?.[0]?.names?.join("/") ?? competition.broadcast ?? null,
      state: competition.status?.type?.state ?? "pre",
      statusDetail: competition.status?.type?.shortDetail ?? competition.status?.type?.detail ?? null,
    });
  }
  return results;
}

export function toYyyymmdd(date: Date): string {
  // Use Central time (matching the rest of the app) rather than raw UTC -
  // a late West Coast kickoff can land on a different UTC calendar day than
  // its actual US game date, which caused ESPN to be queried under the
  // wrong date bucket and return a stale "completed" status for that game.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}${m}${d}`;
}
