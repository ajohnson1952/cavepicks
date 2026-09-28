// app/api/debug-fcs-check/route.ts
// Read-only research endpoint: can Cavepicks carry FCS-vs-FCS games (Ivy,
// Patriot, etc.)? For every FCS-only game in the window (default: the next 8
// days, or ?days=N up to 14) it reports:
//   - inOddsApiFeed: whether The Odds API lists the event at all, via its
//     /events endpoint - which does NOT count against the monthly credit quota
//   - ourDb: whether our regular pull-odds already saved it as a Game and
//     what the latest snapshot's line is from our BOOK_PREFERENCE books (no
//     extra API call - pull-odds already stores every event it gets back)
//   - espnOdds: the line ESPN's own scoreboard shows, if any
// "FCS-only" = on ESPN's FCS scoreboard (groups=81) but not its FBS one
// (groups=80) - ESPN's scoreboard has no per-team division field.
// Writes nothing.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { teamNamesMatch, toYyyymmdd } from "@/lib/espnScores";

export const dynamic = "force-dynamic";

type EspnGame = {
  id: string;
  date: string;
  home: string;
  away: string;
  homeFull: string;
  awayFull: string;
  conference: string | null;
  odds: {
    provider: string | null;
    details: string | null;
    overUnder: number | null;
    homeMl: number | null;
    awayMl: number | null;
  } | null;
};

async function espnScoreboard(yyyymmdd: string, group: 80 | 81): Promise<EspnGame[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${yyyymmdd}&groups=${group}&limit=300`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.events ?? []).flatMap((e: any) => {
    const c = e.competitions?.[0];
    const home = c?.competitors?.find((x: any) => x.homeAway === "home");
    const away = c?.competitors?.find((x: any) => x.homeAway === "away");
    if (!home || !away) return [];
    const o = c.odds?.[0];
    return [
      {
        id: String(e.id),
        date: e.date,
        home: home.team?.location ?? "",
        away: away.team?.location ?? "",
        homeFull: home.team?.displayName ?? "",
        awayFull: away.team?.displayName ?? "",
        conference: c.groups?.shortName ?? c.groups?.name ?? null,
        odds: o
          ? {
              provider: o.provider?.name ?? null,
              details: o.details ?? null,
              overUnder: typeof o.overUnder === "number" ? o.overUnder : null,
              homeMl: o.homeTeamOdds?.moneyLine ?? o.moneyline?.home?.close?.odds ?? null,
              awayMl: o.awayTeamOdds?.moneyLine ?? o.moneyline?.away?.close?.odds ?? null,
            }
          : null,
      },
    ];
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(14, Math.max(1, Number(searchParams.get("days") ?? "8")));
  const from = new Date();
  const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

  const dates: string[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += 24 * 60 * 60 * 1000) dates.push(toYyyymmdd(new Date(t)));
  const uniqueDates = Array.from(new Set(dates));

  const [fcsDays, fbsDays] = await Promise.all([
    Promise.all(uniqueDates.map((d) => espnScoreboard(d, 81))),
    Promise.all(uniqueDates.map((d) => espnScoreboard(d, 80))),
  ]);
  const fbsIds = new Set(fbsDays.flat().map((g) => g.id));
  const fcsOnly = Array.from(new Map(fcsDays.flat().map((g) => [g.id, g])).values()).filter(
    (g) => !fbsIds.has(g.id) && new Date(g.date) >= new Date(from.getTime() - 6 * 60 * 60 * 1000)
  );

  // The Odds API /events - free (no quota cost). Lists events only, no lines.
  let oddsEvents: { id: string; home_team: string; away_team: string; commence_time: string }[] = [];
  let oddsEventsError: string | null = null;
  let quotaHeaders: Record<string, string | null> = {};
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) oddsEventsError = "ODDS_API_KEY is not set";
  else {
    const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
    const url =
      `https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/events` +
      `?commenceTimeFrom=${iso(new Date(from.getTime() - 6 * 60 * 60 * 1000))}&commenceTimeTo=${iso(to)}&apiKey=${apiKey}`;
    const res = await fetch(url, { cache: "no-store" });
    quotaHeaders = {
      used: res.headers.get("x-requests-used"),
      remaining: res.headers.get("x-requests-remaining"),
      lastCallCost: res.headers.get("x-requests-last"),
    };
    if (res.ok) oddsEvents = await res.json();
    else oddsEventsError = `Odds API ${res.status}: ${await res.text()}`;
  }

  const dbGames = await prisma.game.findMany({
    where: { commenceTime: { gte: new Date(from.getTime() - 6 * 60 * 60 * 1000), lte: to } },
    include: { oddsSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
  });

  const sameGame = (oddsHome: string, oddsAway: string, g: EspnGame) =>
    (teamNamesMatch(oddsHome, g.homeFull) || teamNamesMatch(oddsHome, g.home)) &&
    (teamNamesMatch(oddsAway, g.awayFull) || teamNamesMatch(oddsAway, g.away));

  const games = fcsOnly
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((g) => {
      const ev = oddsEvents.find((e) => sameGame(e.home_team, e.away_team, g));
      const db = dbGames.find((d) => sameGame(d.homeTeam, d.awayTeam, g));
      const snap = db?.oddsSnapshots[0] ?? null;
      return {
        matchup: `${g.awayFull} @ ${g.homeFull}`,
        kickoffCT: new Date(g.date).toLocaleString("en-US", {
          timeZone: "America/Chicago",
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        conference: g.conference,
        inOddsApiFeed: !!ev,
        ourDb: db
          ? {
              saved: true,
              hasLine: !!snap && (snap.spreadHome != null || snap.total != null),
              spreadHome: snap?.spreadHome ?? null,
              total: snap?.total ?? null,
              mlHome: snap?.mlHome ?? null,
              mlAway: snap?.mlAway ?? null,
              book: snap?.sourceBook ?? null,
              capturedAt: snap?.capturedAt ?? null,
            }
          : { saved: false },
        espnOdds: g.odds,
      };
    });

  const summary = {
    fcsOnlyGames: games.length,
    inOddsApiFeed: games.filter((g) => g.inOddsApiFeed).length,
    savedByOurPull: games.filter((g) => g.ourDb.saved).length,
    withOurBookLine: games.filter((g) => "hasLine" in g.ourDb && g.ourDb.hasLine).length,
    withEspnLine: games.filter((g) => g.espnOdds?.details || g.espnOdds?.overUnder != null).length,
    espnOddsProviders: Array.from(new Set(games.map((g) => g.espnOdds?.provider).filter(Boolean))),
  };

  return NextResponse.json({
    ok: true,
    window: { from, to, days },
    oddsApi: { totalEventsInWindow: oddsEvents.length, error: oddsEventsError, quota: quotaHeaders },
    summary,
    games,
  });
}
