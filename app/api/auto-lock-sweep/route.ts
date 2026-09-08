// app/api/auto-lock-sweep/route.ts
// Retired. Cavepicks no longer auto-locks anything - a pick that a player
// doesn't lock themselves before the deadline simply doesn't count (see
// lib/lock.ts, the rules page, and CLAUDE.md). This route is kept only so
// the old cron-job.org jobs that still hit it get a clean 200 instead of a
// 404; those jobs can be deleted. It touches nothing.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    retired: true,
    note: "Auto-lock is disabled. Picks must be locked manually or they don't count. This endpoint is a no-op.",
  });
}
