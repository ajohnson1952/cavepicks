// app/api/debug-game-status/route.ts
// Visit /api/debug-game-status?date=20260829&team=jacksonville to see ESPN's
// raw status fields for a specific game - useful when "completed" seems wrong.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const team = (searchParams.get("team") ?? "").toLowerCase();

  if (!date) {
    return NextResponse.json({ ok: false, error: "Pass ?date=YYYYMMDD&team=searchterm" }, { status: 400 });
  }

  const url = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${date}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: `ESPN returned ${res.status}` }, { status: 500 });
  }

  const data = await res.json();
  const events = data.events ?? [];

  const matches = events
    .filter((e: any) => {
      const name = (e.name ?? "").toLowerCase();
      return !team || name.includes(team);
    })
    .map((e: any) => {
      const competition = e.competitions?.[0];
      return {
        name: e.name,
        rawStatus: competition?.status, // the full raw status object, unfiltered
        homeScore: competition?.competitors?.find((c: any) => c.homeAway === "home")?.score,
        awayScore: competition?.competitors?.find((c: any) => c.homeAway === "away")?.score,
      };
    });

  return NextResponse.json({ ok: true, totalEventsThatDate: events.length, matches });
}
