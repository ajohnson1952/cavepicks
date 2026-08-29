// app/api/pull-odds/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pullOdds } from "@/lib/pullOdds";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = (searchParams.get("type") as "early" | "lock") || "early";

  // Placeholder week for now - real week/season rollover comes later
  const week = await prisma.week.upsert({
    where: { seasonYear_weekNumber: { seasonYear: 2026, weekNumber: 1 } },
    update: {},
    create: { seasonYear: 2026, weekNumber: 1 },
  });

  try {
    const { results, unmatchedTeams, espnTeamsFetched } = await pullOdds(type, week.id);
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

