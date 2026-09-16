// app/api/fix-stale-locks/route.ts
// One-off/occasional fix-it tool: bulk-unlocks every currently-locked pick
// in a week whose lockedAt is before a cutoff, for when pull-odds went
// quiet for a stretch (see /api/debug-cron-history) and players locked
// picks against a stale line before the next real pull refreshed it.
// Same thing /admin's "Unlock stale locks" form does - this is just a
// URL-reachable version for running it without opening a browser session.
//
// SAFETY: requires ?key=<ADMIN_PASSWORD>, the actual admin password (same
// secret /admin's login form checks against) - this writes data, so unlike
// wipe-week-zero's link-preview-guard pattern, this needs to be genuinely
// gated, not just confirm-token-gated.
import { NextResponse } from "next/server";
import { unlockStaleLocks } from "@/lib/unlockStaleLocks";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!process.env.ADMIN_PASSWORD || key !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ ok: false, error: "Missing or wrong ?key=" }, { status: 401 });
  }

  const weekNumber = Number(searchParams.get("week"));
  if (!Number.isFinite(weekNumber)) {
    return NextResponse.json({ ok: false, error: "Missing/invalid ?week=" }, { status: 400 });
  }

  const beforeRaw = searchParams.get("before");
  const cutoff = beforeRaw ? new Date(beforeRaw) : new Date();
  if (isNaN(cutoff.getTime())) {
    return NextResponse.json({ ok: false, error: "Invalid ?before= timestamp" }, { status: 400 });
  }

  const result = await unlockStaleLocks(weekNumber, 2026, cutoff);
  return NextResponse.json(result);
}
