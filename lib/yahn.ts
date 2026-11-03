// lib/yahn.ts
// Reads the read-only weekly feed from the-yahngorithm (the owner's model
// site): each game's page URL there, the exact Odds API team names (which is
// what Game.homeTeam / awayTeam hold here, so games match without shared
// ids), and the model's picks. Used for the Joe link on the pick page, the
// "Yahn's pick" marks on the pills, and the /yahn helper page.
//
// Never touches this app's database, and must never break a page: any
// failure (site down, slow, bad response) just returns null and the Joe
// extras quietly don't render.

export const YAHN_SITE = "https://the-yahngorithm.com";
const FEED_BASE = process.env.YAHN_URL ?? YAHN_SITE; // override only for local testing

// One switch for showing the model's pick on the pick sheet. On: a game the
// model has a pick on gets an amber "Yahngo: TENN -18.9" pill (the model's
// projected line). Off: every game just gets the quiet grey "Model" link.
// The /yahn page is unaffected either way.
export const SHOW_YAHN_MARKS = true;

export type YahnPick = {
  market: "spread" | "total";
  side: "home" | "away" | "over" | "under";
  label: string; // e.g. "TENN -13.5" / "Under 57.5", as the model logged it
  modelLabel?: string; // the same pick at the MODEL's projected number: "TENN -18.9" / "Under 51.2"
  edge: number; // points the model disagrees with the market by (always +)
  why: string[];
  result: string | null; // win | loss | push once graded
  loggedAt?: string | null; // when the model made the pick (the ghost player uses this)
};

type YahnTeam = { name: string; abbr: string | null; oddsNames: string[] };

export type YahnGame = {
  id: string;
  url: string;
  kickoff: string;
  home: YahnTeam;
  away: YahnTeam;
  homeWinProb?: number | null; // model's chance the home team wins outright (ghost's dog pick)
  picks: YahnPick[];
};

export type YahnFeed = {
  season: number;
  week: number;
  record?: { win: number; loss: number; push: number };
  games: YahnGame[];
};

export async function getYahnFeed(weekNumber: number): Promise<YahnFeed | null> {
  try {
    // Deliberately CACHED (15 min), unlike the ESPN / Odds API calls here that
    // must be no-store: the model only updates every ~30 min, and this keeps
    // every pick-page load from waiting on another site.
    const res = await fetch(`${FEED_BASE}/api/feed?week=${weekNumber}`, {
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const feed = (await res.json()) as YahnFeed;
    return Array.isArray(feed?.games) ? feed : null;
  } catch {
    return null;
  }
}

/** The feed's entry for one of our games, matched on the Odds API team names. */
export function findYahnGame(feed: YahnFeed | null, homeTeam: string, awayTeam: string): YahnGame | null {
  if (!feed) return null;
  return (
    feed.games.find((g) => g.home.oddsNames.includes(homeTeam) && g.away.oddsNames.includes(awayTeam)) ?? null
  );
}

/** Where Joe links when a game has no match (or the feed is down). */
export const yahnWeekUrl = (weekNumber: number) => `${YAHN_SITE}/?week=${weekNumber}`;

/** Profit betting 1 unit per decided pick at -110. */
export function unitsAt110(win: number, loss: number): number {
  return Math.round((win * (100 / 110) - loss) * 100) / 100;
}
