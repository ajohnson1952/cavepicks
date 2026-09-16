// app/api/void-duplicate-events/route.ts
// One-off/occasional fix-it tool: voids a stale duplicate Game row by its
// oddsApiEventId (see the duplicate-Game-row gotcha in CLAUDE.md). Refuses
// - and reports instead - if the game has any locked picks on it, since
// those need lib/mergeGames.ts's mergeGame() (via /admin's "Merge picks
// in" form) so the picks move to the correct row instead of vanishing.
// This route is void-only, for the common case where nobody happened to
// pick the phantom duplicate.
//
// SAFETY: requires ?key=<ADMIN_PASSWORD>, the actual admin password (same
// secret /admin's login form checks against) - this writes data, so it
// needs to be genuinely gated, not just confirm-token-gated the way
// wipe-week-zero (a guard against link-preview bots, not real access
// control) is.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!process.env.ADMIN_PASSWORD || key !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ ok: false, error: "Missing or wrong ?key=" }, { status: 401 });
  }

  const eventIdsRaw = searchParams.get("eventIds");
  if (!eventIdsRaw) {
    return NextResponse.json({ ok: false, error: "Missing ?eventIds=" }, { status: 400 });
  }
  const eventIds = eventIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  const results = [];
  for (const eventId of eventIds) {
    const game = await prisma.game.findUnique({ where: { oddsApiEventId: eventId } });
    if (!game) {
      results.push({ eventId, ok: false, note: "no game found with this oddsApiEventId" });
      continue;
    }
    const lockedPickCount = await prisma.pick.count({ where: { gameId: game.id, locked: true } });
    if (lockedPickCount > 0) {
      results.push({
        eventId,
        ok: false,
        note: `refused - ${lockedPickCount} locked pick(s) on this game, use mergeGame instead`,
        matchup: `${game.awayTeam} @ ${game.homeTeam}`,
      });
      continue;
    }
    await prisma.game.update({
      where: { id: game.id },
      data: { voided: true, voidReason: "Duplicate odds-API event, voided (no picks affected)" },
    });
    results.push({ eventId, ok: true, matchup: `${game.awayTeam} @ ${game.homeTeam}`, commenceTime: game.commenceTime.toISOString() });
  }

  return NextResponse.json({ ok: true, results });
}
