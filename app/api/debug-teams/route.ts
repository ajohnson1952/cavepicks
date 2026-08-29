// app/api/debug-teams/route.ts
// Visit /api/debug-teams?q=liu to see exactly what ESPN calls a team,
// instead of guessing at aliases blind.
import { NextResponse } from "next/server";
import { fetchEspnTeams } from "@/lib/espnTeams";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").toLowerCase().trim();
  if (!q) {
    return NextResponse.json({ ok: false, error: "Pass ?q=searchterm, e.g. ?q=liu" }, { status: 400 });
  }

  const teams = await fetchEspnTeams();
  const matches = teams.filter(
    (t) => t.location.toLowerCase().includes(q) || t.abbreviation.toLowerCase().includes(q)
  );

  return NextResponse.json({ ok: true, totalTeamsFetched: teams.length, matches });
}
