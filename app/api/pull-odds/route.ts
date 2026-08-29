// app/api/pull-odds/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pullOdds } from "@/lib/pullOdds";
import { getOrCreateCurrentWeek } from "@/lib/currentWeek";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = (searchParams.get("type") as "early" | "lock") || "early";

  const week = await getOrCreateCurrentWeek();

  try {
    const results = await pullOdds(type, week.id);
    return NextResponse.json({ ok: true, snapshotType: type, count: results.length, results });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
