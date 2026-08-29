// lib/oddsApi.ts
import { SPORTSBOOK } from "./lock";

export type OddsGame = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  spreadHome: number | null;
  spreadAway: number | null;
  total: number | null;
  mlHome: number | null;
  mlAway: number | null;
  favoriteTeam: string | null;
  underdogTeam: string | null;
};

export async function fetchDraftKingsOdds(): Promise<OddsGame[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error("ODDS_API_KEY is not set");

  const url =
    `https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds` +
    `?regions=us&markets=h2h,spreads,totals&oddsFormat=american` +
    `&bookmakers=${SPORTSBOOK}&apiKey=${apiKey}`;

  const res = await fetch(url);
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
    const totalOutcome = totals?.outcomes?.[0];

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
      total: totalOutcome?.point ?? null,
      mlHome: homeMl?.price ?? null,
      mlAway: awayMl?.price ?? null,
      favoriteTeam,
      underdogTeam,
    };
  });
}
