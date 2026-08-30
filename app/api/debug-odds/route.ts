// app/api/debug-odds/route.ts
// Visit /api/debug-odds?week=1 to see, for every game in that week, how many
// odds snapshots exist and whether the latest one actually has real numbers.
// Add &live=1 to also hit The Odds API right now and compare - this tells you
// whether a game with no line is (a) not being returned by the API at all,
// (b) returned but with no line from any book in BOOK_PREFERENCE yet, or
// (c) split into a separate row by an event-id / name mismatch. It also
// breaks down which book each game's line is coming from.
//
// Add &probe=1 to do ONE extra unfiltered call (every US book, not just our
// preference list) - for each game with no line right now, it shows which
// bookmakers The Odds API DOES have spreads for, and whether one of our
// preference books is among them (meaning the next pull should fix it).
// Costs a couple API credits, use sparingly.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchOdds } from "@/lib/oddsApi";
import { getWeekNumberForDate } from "@/lib/currentWeek";
import { BOOK_PREFERENCE } from "@/lib/lock";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const weekNumber = Number(searchParams.get("week") ?? "1");
  const includeLive = searchParams.get("live") === "1";
  const includeProbe = searchParams.get("probe") === "1";

  const week = await prisma.week.findFirst({ where: { seasonYear: 2026, weekNumber } });
  if (!week) return NextResponse.json({ ok: false, error: `No week ${weekNumber}` }, { status: 404 });

  const games = await prisma.game.findMany({
    where: { weekId: week.id },
    include: { oddsSnapshots: { orderBy: { capturedAt: "asc" } } },
    orderBy: { commenceTime: "asc" },
  });

  const rows = games.map((g) => {
    const latest = g.oddsSnapshots[g.oddsSnapshots.length - 1] ?? null;
    // Same gate the pick sheet uses to decide "Odds not posted yet"
    const showsAsPosted =
      !!latest && latest.spreadHome != null && latest.spreadAway != null && latest.total != null;
    return {
      matchup: `${g.awayTeam} @ ${g.homeTeam}`,
      commenceTime: g.commenceTime.toISOString(),
      oddsApiEventId: g.oddsApiEventId,
      snapshotCount: g.oddsSnapshots.length,
      snapshotTypes: Array.from(new Set(g.oddsSnapshots.map((s) => s.snapshotType))),
      latest: latest && {
        spreadHome: latest.spreadHome,
        spreadAway: latest.spreadAway,
        total: latest.total,
        mlHome: latest.mlHome,
        mlAway: latest.mlAway,
        capturedAt: latest.capturedAt.toISOString(),
      },
      showsAsPosted,
    };
  });

  const summary = {
    totalGames: rows.length,
    showsAsPosted: rows.filter((r) => r.showsAsPosted).length,
    showsAsNotPosted: rows.filter((r) => !r.showsAsPosted).length,
    hasSomeOddsButHidden: rows.filter(
      (r) => !r.showsAsPosted && !!r.latest && (r.latest.spreadHome != null || r.latest.total != null || r.latest.mlHome != null)
    ).map((r) => r.matchup),
    noSnapshotAtAll: rows.filter((r) => r.snapshotCount === 0).map((r) => r.matchup),
  };

  let live: unknown = undefined;
  if (includeLive) {
    const apiGames = await fetchOdds();
    const inThisWeek = apiGames.filter(
      (ag) => getWeekNumberForDate(new Date(ag.commenceTime)) === weekNumber
    );
    const dbEventIds = new Set(games.map((g) => g.oddsApiEventId));
    const bookCounts: Record<string, number> = {};
    for (const ag of inThisWeek) {
      const key = ag.sourceBook ?? "(no line)";
      bookCounts[key] = (bookCounts[key] ?? 0) + 1;
    }
    live = {
      apiGamesTotalReturned: apiGames.length,
      apiGamesInThisWeek: inThisWeek.length,
      lineSourceByBook: bookCounts,
      apiGamesInWeekWithNoSpreadOrTotal: inThisWeek
        .filter((ag) => ag.spreadHome == null && ag.total == null)
        .map((ag) => `${ag.awayTeam} @ ${ag.homeTeam}`),
      apiGamesInWeekNotInDb: inThisWeek
        .filter((ag) => !dbEventIds.has(ag.id))
        .map((ag) => `${ag.awayTeam} @ ${ag.homeTeam}`),
    };
  }

  let probe: unknown = undefined;
  if (includeProbe) {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      probe = { error: "ODDS_API_KEY not set" };
    } else {
      // No &bookmakers filter - regions=us returns every US book The Odds API has.
      const url =
        `https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds` +
        `?regions=us&markets=spreads,totals&oddsFormat=american&apiKey=${apiKey}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        probe = { error: `Odds API ${res.status}: ${await res.text()}` };
      } else {
        const data: any[] = await res.json();
        const byEventId = new Map<string, any>();
        for (const e of data) byEventId.set(e.id, e);

        // The games with no usable line in our DB right now
        const missing = games.filter((g) => {
          const latest = g.oddsSnapshots[g.oddsSnapshots.length - 1] ?? null;
          return !latest || (latest.spreadHome == null && latest.total == null);
        });

        probe = {
          creditsUsed: res.headers.get("x-requests-last") ?? "unknown",
          creditsRemaining: res.headers.get("x-requests-remaining") ?? "unknown",
          ourBooks: BOOK_PREFERENCE,
          missingGames: missing.map((g) => {
            const e = g.oddsApiEventId ? byEventId.get(g.oddsApiEventId) : undefined;
            const books: { key: string; hasSpreads: boolean; hasTotals: boolean }[] = (e?.bookmakers ?? []).map(
              (b: any) => ({
                key: b.key,
                hasSpreads: !!b.markets?.find((m: any) => m.key === "spreads")?.outcomes?.length,
                hasTotals: !!b.markets?.find((m: any) => m.key === "totals")?.outcomes?.length,
              })
            );
            const ourBookWithSpread = BOOK_PREFERENCE.find((k) => books.find((b) => b.key === k && b.hasSpreads));
            return {
              matchup: `${g.awayTeam} @ ${g.homeTeam}`,
              commenceTime: g.commenceTime.toISOString(),
              foundInProbe: !!e,
              bookmakerCount: books.length,
              booksWithSpreads: books.filter((b) => b.hasSpreads).map((b) => b.key),
              // If this is set, our next pull SHOULD fill this game in - it means
              // one of our preference books has a spread the last pull missed.
              ourBookThatShouldCoverIt: ourBookWithSpread ?? null,
            };
          }),
        };
      }
    }
  }

  return NextResponse.json({ ok: true, weekNumber, summary, live, probe, rows });
}
