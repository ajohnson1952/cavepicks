// app/api/ghost-run/route.ts
// Runs "Yahn" the ghost player on demand (lib/ghost.ts). Normally the ghost
// runs by itself inside grade-results; this is for backfilling past weeks and
// for looking at what it would do.
//
//   /api/ghost-run?key=<ADMIN_PASSWORD>&weeks=1-5&dry=1   preview, writes nothing
//   /api/ghost-run?key=<ADMIN_PASSWORD>&weeks=1-5         backfill weeks 1-5
//   /api/ghost-run?key=<ADMIN_PASSWORD>                   same as the automatic run
//
// Backfilling replays each week exactly as the live rule would have played
// it: the model's picks by the time they were logged, and the line that was
// on screen 30 minutes before each kickoff. It only ever ADDS ghost picks
// that don't exist yet - it never changes or removes one.
//
// SAFETY: writes data, so it needs the real admin password as ?key= (same
// pattern as fix-stale-locks). It only touches the GhostPick table.
import { NextResponse } from "next/server";
import { runGhost } from "@/lib/ghost";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseWeeks(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const out = new Set<number>();
  for (const part of raw.split(",")) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let w = Math.min(a, b); w <= Math.max(a, b) && w <= 25; w++) out.add(w);
  }
  return out.size ? [...out].sort((x, y) => x - y) : undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!process.env.ADMIN_PASSWORD || key !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ ok: false, error: "Missing or wrong ?key=" }, { status: 401 });
  }
  const weeks = parseWeeks(searchParams.get("weeks"));
  const dryRun = searchParams.get("dry") === "1";
  try {
    // explicit weeks = a backfill, so no "only recent deadlines" window
    const result = await runGhost({ weeks, windowHours: weeks ? null : undefined, dryRun });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
