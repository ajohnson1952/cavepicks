// app/api/cave-splits/route.ts
// Read-only, public: how many locked picks are on each side of each game in
// a week - counts only, no names (lib/caveSplits.ts). Read by the owner's
// model site, the-yahngorithm. Served from a cache that only refreshes when
// a pick is locked or unlocked, so calling this doesn't wake the database.
import { NextResponse } from "next/server";
import { getCaveSplits } from "@/lib/caveSplits";
import { getWeekNumberForDate } from "@/lib/currentWeek";

export async function GET(request: Request) {
  const raw = Number(new URL(request.url).searchParams.get("week"));
  const current = getWeekNumberForDate();
  const week = Number.isInteger(raw) && raw >= 1 && raw <= 25 ? raw : current;
  // only this week and last - nothing to gain from letting old weeks be pulled
  if (week > current || week < current - 1) return NextResponse.json({ week, leagueSize: 0, games: [] });
  return NextResponse.json(await getCaveSplits(week));
}
