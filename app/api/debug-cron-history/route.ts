// app/api/debug-cron-history/route.ts
// Diagnostic for "did the cron actually stop firing, or does it just look
// that way": OddsSnapshot is the only append-only log we have (JobRun is a
// single upserted row per job, so it can't show history). Buckets recent
// snapshots' capturedAt into distinct pull "runs" (a pull writes ~dozens of
// rows within a couple seconds of each other) so a gap between runs is
// obvious at a glance, whoever/whatever triggered them.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const RUN_GAP_MS = 2 * 60 * 1000; // snapshots more than 2 min apart count as separate runs

export async function GET() {
  const rows = await prisma.oddsSnapshot.findMany({
    select: { capturedAt: true },
    orderBy: { capturedAt: "desc" },
    take: 1000,
  });

  const runs: { startedAt: string; endedAt: string; snapshotCount: number }[] = [];
  let current: { start: Date; end: Date; count: number } | null = null;

  // rows are newest-first; walk oldest-first so each run's start/end reads naturally
  for (const r of [...rows].reverse()) {
    if (!current) {
      current = { start: r.capturedAt, end: r.capturedAt, count: 1 };
      continue;
    }
    if (r.capturedAt.getTime() - current.end.getTime() > RUN_GAP_MS) {
      runs.push({
        startedAt: current.start.toISOString(),
        endedAt: current.end.toISOString(),
        snapshotCount: current.count,
      });
      current = { start: r.capturedAt, end: r.capturedAt, count: 1 };
    } else {
      current.end = r.capturedAt;
      current.count++;
    }
  }
  if (current) {
    runs.push({ startedAt: current.start.toISOString(), endedAt: current.end.toISOString(), snapshotCount: current.count });
  }

  const gaps = runs.slice(1).map((run, i) => ({
    afterRun: runs[i].endedAt,
    beforeRun: run.startedAt,
    gapMinutes: Math.round((new Date(run.startedAt).getTime() - new Date(runs[i].endedAt).getTime()) / 60000),
  }));

  return NextResponse.json({
    ok: true,
    note: `Last ${rows.length} OddsSnapshot rows, grouped into pull "runs". Big gapMinutes = pull-odds wasn't firing (or was failing) in that window.`,
    runCount: runs.length,
    runs,
    biggestGaps: gaps.sort((a, b) => b.gapMinutes - a.gapMinutes).slice(0, 10),
  });
}
