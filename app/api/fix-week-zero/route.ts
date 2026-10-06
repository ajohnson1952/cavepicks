// app/api/fix-week-zero/route.ts
// One-time fix: the existing week was created as "1" before we switched to
// 0-indexed numbering. This relabels it to "0" in place (same row, same id,
// same linked games/picks) rather than creating a new orphaned row.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAdmin(request); // lib/adminAuth.ts - logged in at /admin, or ?key=
  if (denied) return denied;
  const result = await prisma.week.updateMany({
    where: { seasonYear: 2026, weekNumber: 1 },
    data: { weekNumber: 0 },
  });
  return NextResponse.json({ ok: true, weeksUpdated: result.count });
}
