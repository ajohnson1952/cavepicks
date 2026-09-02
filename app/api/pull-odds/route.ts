// app/api/pull-odds/route.ts
import { NextResponse } from "next/server";
import { pullOdds } from "@/lib/pullOdds";

export const dynamic = "force-dynamic";

// Snapshot label stored on every OddsSnapshot row. Historically the only
// value the cron jobs send is "market" (a single tuned pull pattern - there
// is no separate "early" vs "lock" pull). Anything else passed through the
// ?type= param is accepted as-is so this never 500s on an unexpected value.
const DEFAULT_SNAPSHOT_TYPE = "market";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type")?.trim() || DEFAULT_SNAPSHOT_TYPE;

  try {
    const { results, bookCounts, unmatchedTeams, espnTeamsFetched } = await pullOdds(type);
    return NextResponse.json({
      ok: true,
      snapshotType: type,
      count: results.length,
      bookCounts,
      // Small sample only - a cron caller discards the body, and returning
      // the full array just inflates peak memory on Render's 512MB instance.
      sample: results.slice(0, 8),
      espnTeamsFetched,
      unmatchedTeams,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
