// lib/oddsApi.ts
import { BOOK_PREFERENCE } from "./lock";

export type OddsGame = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  spreadHome: number | null;
  spreadAway: number | null;
  spreadHomePrice: number | null;
  spreadAwayPrice: number | null;
  total: number | null;
  totalOverPrice: number | null;
  totalUnderPrice: number | null;
  mlHome: number | null;
  mlAway: number | null;
  favoriteTeam: string | null;
  underdogTeam: string | null;
  sourceBook: string | null; // which book in BOOK_PREFERENCE this game's line came from
};

const marketOutcomes = (book: any, key: string): any[] =>
  book?.markets?.find((m: any) => m.key === key)?.outcomes ?? [];

// Of the books we requested, pick the one to use for THIS game: walk
// BOOK_PREFERENCE in order and take the first book that actually has a
// spread posted, then fall back to first-with-a-total, then first-with-a-
// moneyline, then just the first book present. Reading every market from a
// single book keeps the spread and total internally consistent.
function pickBook(bookmakers: any[]): any | undefined {
  const ordered = BOOK_PREFERENCE.map((k) => bookmakers?.find((b: any) => b.key === k)).filter(Boolean);
  return (
    ordered.find((b) => marketOutcomes(b, "spreads").length) ??
    ordered.find((b) => marketOutcomes(b, "totals").length) ??
    ordered.find((b) => marketOutcomes(b, "h2h").length) ??
    ordered[0]
  );
}

// Pulls NCAAF odds from The Odds API for every book in BOOK_PREFERENCE in one
// call (see lib/lock.ts for why more than one). Games The Odds API returns
// that none of those books have priced yet come back with every line field
// null - callers handle that.
export async function fetchOdds(): Promise<OddsGame[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error("ODDS_API_KEY is not set");

  const url =
    `https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds` +
    `?regions=us&markets=h2h,spreads,totals&oddsFormat=american` +
    `&bookmakers=${BOOK_PREFERENCE.join(",")}&apiKey=${apiKey}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Odds API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();

  return data.map((g: any) => {
    const book = pickBook(g.bookmakers ?? []);
    const spreads = marketOutcomes(book, "spreads");
    const totals = marketOutcomes(book, "totals");
    const h2h = marketOutcomes(book, "h2h");

    const homeSpread = spreads.find((o: any) => o.name === g.home_team);
    const awaySpread = spreads.find((o: any) => o.name === g.away_team);
    const homeMl = h2h.find((o: any) => o.name === g.home_team);
    const awayMl = h2h.find((o: any) => o.name === g.away_team);

    // Bug fix: totals has TWO outcomes (Over and Under), each with its own
    // juice - previously we only ever grabbed outcomes[0], silently assuming
    // both sides carried identical price, which isn't always true.
    const overOutcome = totals.find((o: any) => o.name === "Over");
    const underOutcome = totals.find((o: any) => o.name === "Under");

    let favoriteTeam: string | null = null;
    let underdogTeam: string | null = null;
    if (homeSpread && awaySpread) {
      favoriteTeam = homeSpread.point < 0 ? g.home_team : g.away_team;
      underdogTeam = homeSpread.point < 0 ? g.away_team : g.home_team;
    }

    return {
      id: g.id,
      homeTeam: g.home_team,
      awayTeam: g.away_team,
      commenceTime: g.commence_time,
      spreadHome: homeSpread?.point ?? null,
      spreadAway: awaySpread?.point ?? null,
      spreadHomePrice: homeSpread?.price ?? null,
      spreadAwayPrice: awaySpread?.price ?? null,
      total: overOutcome?.point ?? underOutcome?.point ?? null,
      totalOverPrice: overOutcome?.price ?? null,
      totalUnderPrice: underOutcome?.price ?? null,
      mlHome: homeMl?.price ?? null,
      mlAway: awayMl?.price ?? null,
      favoriteTeam,
      underdogTeam,
      sourceBook: (homeSpread || overOutcome || homeMl) ? book?.key ?? null : null,
    };
  });
}
