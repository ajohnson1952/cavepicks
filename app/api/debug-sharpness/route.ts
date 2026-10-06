// app/api/debug-sharpness/route.ts
// Read-only: the raw numbers behind /history's Sharp Report (per-player
// record, closing line value, tendencies, sharp score). See lib/sharpness.ts.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { computeSharpness } from "@/lib/sharpness";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAdmin(request); // lib/adminAuth.ts - logged in at /admin, or ?key=
  if (denied) return denied;
  return NextResponse.json({ ok: true, players: await computeSharpness(2026) });
}
