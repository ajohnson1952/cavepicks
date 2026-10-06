// app/api/pull-odds/route.ts
import { NextResponse } from "next/server";
import { pullOdds } from "@/lib/pullOdds";
import { recordJobRun, getJobRuns } from "@/lib/jobRun";

export const dynamic = "force-dynamic";

// Snapshot label stored on every OddsSnapshot row. Historically the only
// value the cron jobs send is "market" (a single tuned pull pattern - there
// is no separate "early" vs "lock" pull). Anything else passed through the
// ?type= param is accepted as-is so this never 500s on an unexpected value.
const DEFAULT_SNAPSHOT_TYPE = "market";

// This URL has to stay open (cron-job.org calls it with no login), and every
// pull spends Odds API credits from a 500/month budget - so anyone who found
// the address could drain it by reloading. The scheduled jobs are never
// closer than an hour apart, so a pull that arrives within MIN_GAP_MINUTES of
// the last successful one is not the schedule: skip it without calling the
// Odds API. (The admin "Run now" button calls pullOdds() directly and isn't
// limited by this.)
const MIN_GAP_MINUTES = 20;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type")?.trim() || DEFAULT_SNAPSHOT_TYPE;

  const [last] = await getJobRuns(["pull-odds"]);
  if (last?.ok && Date.now() - last.ranAt.getTime() < MIN_GAP_MINUTES * 60_000) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `odds were pulled ${Math.round((Date.now() - last.ranAt.getTime()) / 60_000)} min ago - not pulling again yet`,
    });
  }

  try {
    const { results, bookCounts, unmatchedTeams, espnTeamsFetched, mergedDuplicates } = await pullOdds(type);
    const bookSummary = Object.entries(bookCounts).map(([k, v]) => `${k}:${v}`).join(" ");
    await recordJobRun(
      "pull-odds",
      "cron",
      true,
      `${results.length} games pulled (${bookSummary})` +
        `${unmatchedTeams.length ? `, ${unmatchedTeams.length} unmatched teams` : ""}` +
        `${mergedDuplicates.length ? `, ${mergedDuplicates.length} duplicate game(s) auto-merged` : ""}`
    );
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
      mergedDuplicates,
    });
  } catch (err: any) {
    await recordJobRun("pull-odds", "cron", false, err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
