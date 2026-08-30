// app/api/debug-teams/route.ts
// Visit /api/debug-teams?q=liu to search, or /api/debug-teams with no query
// to get the full list back to scan yourself (sorted alphabetically).
import { NextResponse } from "next/server";
import { fetchEspnTeams } from "@/lib/espnTeams";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").toLowerCase().trim();

  const teams = await fetchEspnTeams();

  if (!q) {
    const all = teams
      .map((t) => ({ location: t.location, abbreviation: t.abbreviation }))
      .sort((a, b) => a.location.localeCompare(b.location));
    return NextResponse.json({ ok: true, totalTeamsFetched: teams.length, all });
  }

  const matches = teams.filter(
    (t) => t.location.toLowerCase().includes(q) || t.abbreviation.toLowerCase().includes(q)
  );

  return NextResponse.json({ ok: true, totalTeamsFetched: teams.length, matches });
}
