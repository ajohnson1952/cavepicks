// lib/oddsApi.ts
import { SPORTSBOOK } from "./lock";

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
};

// Pulls NCAAF odds for our single book of record (SPORTSBOOK, see lib/lock.ts)
// from The Odds API. Games The Odds API returns but that book hasn't priced
// yet come back with every line field null - callers handle that.
export async function fetchOdds(): Promise<OddsGame[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error("ODDS_API_KEY is not set");

  const url =
    `https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds` +
    `?regions=us&markets=h2h,spreads,totals&oddsFormat=american` +
    `&bookmakers=${SPORTSBOOK}&apiKey=${apiKey}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Odds API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();

  return data.map((g: any) => {
    const book = g.bookmakers?.find((b: any) => b.key === SPORTSBOOK);
    const h2h = book?.markets?.find((m: any) => m.key === "h2h");
    const spreads = book?.markets?.find((m: any) => m.key === "spreads");
    const totals = book?.markets?.find((m: any) => m.key === "totals");

    const homeSpread = spreads?.outcomes?.find((o: any) => o.name === g.home_team);
    const awaySpread = spreads?.outcomes?.find((o: any) => o.name === g.away_team);
    const homeMl = h2h?.outcomes?.find((o: any) => o.name === g.home_team);
    const awayMl = h2h?.outcomes?.find((o: any) => o.name === g.away_team);

    // Bug fix: totals has TWO outcomes (Over and Under), each with its own
    // juice - previously we only ever grabbed outcomes[0], silently assuming
    // both sides carried identical price, which isn't always true.
    const overOutcome = totals?.outcomes?.find((o: any) => o.name === "Over");
    const underOutcome = totals?.outcomes?.find((o: any) => o.name === "Under");

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
    };
  });
}
