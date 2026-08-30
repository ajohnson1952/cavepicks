// app/api/pull-odds/route.ts
import { NextResponse } from "next/server";
import { pullOdds } from "@/lib/pullOdds";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = (searchParams.get("type") as "early" | "lock") || "early";

  try {
    const { results, unmatchedTeams, espnTeamsFetched } = await pullOdds(type);
    return NextResponse.json({
      ok: true,
      snapshotType: type,
      count: results.length,
      results,
      espnTeamsFetched,
      unmatchedTeams,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

