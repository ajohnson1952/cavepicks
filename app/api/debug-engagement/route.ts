// app/api/debug-engagement/route.ts
// Everything the database knows about how the 7 players actually use the site:
// participation, completion, whether they come back to lock manually or just
// let the auto-lock sweep do it, how far ahead they pick, and how many
// separate sittings they spread a week's card across.
//
// Blind spots (no way to see these without adding request logging):
//   - pure browsing: checking the Board / Standings, or opening the pick page
//     without selecting anything, leaves no row anywhere
//   - in-place edits: changing a selection updates the same Pick row, so only
//     the LATEST pick time per slot is visible, not the churn
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SEASON_YEAR } from "@/lib/currentWeek";
import { AUTO_LOCK_MINUTES } from "@/lib/lock";

export const dynamic = "force-dynamic";

const MS = { min: 60_000, hour: 3_600_000, day: 86_400_000 };
const SITTING_GAP_MS = 30 * MS.min; // gap between picks that counts as a new session
const LOCK_DEADLINE_MS = AUTO_LOCK_MINUTES * MS.min;

// CT wall-clock weekday + hour for a UTC instant (never use raw Date methods -
// Render runs in UTC, see CLAUDE.md).
function centralParts(d: Date): { weekday: string; hour: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    weekday: get("weekday"),
    hour: parseInt(get("hour"), 10) % 24,
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const round1 = (n: number) => Math.round(n * 10) / 10;

export async function GET() {
  const now = Date.now();

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const weeks = await prisma.week.findMany({
    where: { seasonYear: SEASON_YEAR, weekNumber: { gte: 1 } }, // week 0 excluded everywhere
    orderBy: { weekNumber: "asc" },
  });
  const weekIds = weeks.map((w) => w.id);
  const games = await prisma.game.findMany({ where: { weekId: { in: weekIds } } });
  const picks = await prisma.pick.findMany({ where: { weekId: { in: weekIds } } });

  const gameById = new Map(games.map((g) => [g.id, g]));

  // A week "counts" for participation once its earliest game has kicked off.
  const weekFirstKick = new Map<string, number>();
  for (const g of games) {
    const t = g.commenceTime.getTime();
    if (!weekFirstKick.has(g.weekId) || t < weekFirstKick.get(g.weekId)!) {
      weekFirstKick.set(g.weekId, t);
    }
  }
  const elapsedWeekIds = new Set(
    weekIds.filter((id) => (weekFirstKick.get(id) ?? Infinity) < now)
  );
  const weeksElapsed = elapsedWeekIds.size;

  // ---- classify each locked pick ----
  type Kind = "manual" | "autoSweep" | "afterKickoff" | "unlocked";
  function classify(p: (typeof picks)[number]): Kind {
    if (!p.locked || !p.lockedAt) return "unlocked";
    const g = gameById.get(p.gameId);
    if (!g) return "unlocked";
    const kick = g.commenceTime.getTime();
    const la = p.lockedAt.getTime();
    if (la > kick) return "afterKickoff"; // grade-results safety net caught it
    if (la < kick - LOCK_DEADLINE_MS - MS.min) return "manual"; // clearly before the 30-min wall
    return "autoSweep"; // landed in the auto-lock window -> player never came back
  }

  // ---- per-user rollup ----
  const perUser = users.map((u) => {
    const mine = picks.filter((p) => p.userId === u.id);
    const byWeek = new Map<string, typeof mine>();
    for (const p of mine) {
      if (!byWeek.has(p.weekId)) byWeek.set(p.weekId, []);
      byWeek.get(p.weekId)!.push(p);
    }

    let manual = 0, autoSweep = 0, afterKickoff = 0, unlocked = 0;
    const selectionLeadHrs: number[] = [];
    const manualLockLeadHrs: number[] = [];
    const sittingsPerWeek: number[] = [];
    const firstPickStart: string[] = []; // CT "weekday HH" of the first pick each week
    let firstSeen = Infinity, lastSeen = -Infinity;
    const activeDateKeys = new Set<string>();
    const weekRows: any[] = [];

    for (const w of weeks) {
      const wp = byWeek.get(w.id) ?? [];
      if (wp.length === 0) continue;

      const sides = wp.filter((p) => p.pickType === "SPREAD" || p.pickType === "TOTAL").length;
      const dog = wp.some((p) => p.pickType === "DOG");
      let wManual = 0, wAuto = 0, wAfter = 0;

      for (const p of wp) {
        const g = gameById.get(p.gameId);
        const k = classify(p);
        if (k === "manual") manual++, wManual++;
        else if (k === "autoSweep") autoSweep++, wAuto++;
        else if (k === "afterKickoff") afterKickoff++, wAfter++;
        else unlocked++;

        const created = p.createdAt.getTime();
        firstSeen = Math.min(firstSeen, created);
        lastSeen = Math.max(lastSeen, created);
        activeDateKeys.add(centralParts(p.createdAt).dateKey);
        if (g) selectionLeadHrs.push((g.commenceTime.getTime() - created) / MS.hour);

        if (p.lockedAt && k === "manual") {
          const la = p.lockedAt.getTime();
          lastSeen = Math.max(lastSeen, la);
          activeDateKeys.add(centralParts(p.lockedAt).dateKey);
          if (g) manualLockLeadHrs.push((g.commenceTime.getTime() - la) / MS.hour);
        }
      }

      // sittings: cluster this week's createdAt values, >30min gap = new sitting
      const times = wp.map((p) => p.createdAt.getTime()).sort((a, b) => a - b);
      let sittings = times.length ? 1 : 0;
      for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] > SITTING_GAP_MS) sittings++;
      if (times.length) {
        sittingsPerWeek.push(sittings);
        const fp = centralParts(new Date(times[0]));
        firstPickStart.push(`${fp.weekday} ${String(fp.hour).padStart(2, "0")}h`);
      }

      weekRows.push({
        week: w.weekNumber,
        sides: `${sides}/5`,
        dog,
        complete: sides === 5 && dog,
        manualLocks: wManual,
        autoLocks: wAuto,
        lockedAfterKickoff: wAfter || undefined,
        sittings: sittingsPerWeek[sittingsPerWeek.length - 1],
      });
    }

    const lockedTotal = manual + autoSweep + afterKickoff;
    const weeksParticipated = weekRows.length;
    const weeksComplete = weekRows.filter((r) => r.complete).length;

    return {
      name: u.name,
      addedAt: u.createdAt.toISOString().slice(0, 10),
      weeksParticipated,
      weeksComplete,
      participationRate: weeksElapsed ? round1((weeksParticipated / weeksElapsed) * 100) + "%" : "n/a",
      completionRate: weeksElapsed ? round1((weeksComplete / weeksElapsed) * 100) + "%" : "n/a",
      picksTotal: manual + autoSweep + afterKickoff + unlocked,
      lockStyle: {
        manual,
        autoSweep, // player set picks but never came back to lock them
        afterKickoff, // sweep missed them; grade-results force-locked
        unlocked,
        manualLockRate: lockedTotal ? round1((manual / lockedTotal) * 100) + "%" : "n/a",
      },
      medianSelectionLeadHrs: median(selectionLeadHrs) != null ? round1(median(selectionLeadHrs)!) : null,
      medianManualLockLeadHrs: median(manualLockLeadHrs) != null ? round1(median(manualLockLeadHrs)!) : null,
      avgSittingsPerWeek: sittingsPerWeek.length ? round1(sittingsPerWeek.reduce((a, b) => a + b, 0) / sittingsPerWeek.length) : null,
      distinctActiveDays: activeDateKeys.size,
      firstSeen: firstSeen === Infinity ? null : new Date(firstSeen).toISOString(),
      lastSeen: lastSeen === -Infinity ? null : new Date(lastSeen).toISOString(),
      daysSinceLastSeen: lastSeen === -Infinity ? null : round1((now - lastSeen) / MS.day),
      firstPickStartByWeek: firstPickStart,
      weeks: weekRows,
    };
  });

  // ---- per-week rollup ----
  const perWeek = weeks
    .filter((w) => picks.some((p) => p.weekId === w.id))
    .map((w) => {
      const wp = picks.filter((p) => p.weekId === w.id);
      const participants = new Set(wp.map((p) => p.userId));
      const completeUsers = users.filter((u) => {
        const up = wp.filter((p) => p.userId === u.id);
        const sides = up.filter((p) => p.pickType === "SPREAD" || p.pickType === "TOTAL").length;
        return sides === 5 && up.some((p) => p.pickType === "DOG");
      });
      let manual = 0, locked = 0;
      for (const p of wp) {
        const k = classify(p);
        if (k !== "unlocked") locked++;
        if (k === "manual") manual++;
      }
      return {
        week: w.weekNumber,
        elapsed: elapsedWeekIds.has(w.id),
        games: games.filter((g) => g.weekId === w.id).length,
        participants: participants.size,
        completedCard: completeUsers.length,
        totalPicks: wp.length,
        manualLockRate: locked ? round1((manual / locked) * 100) + "%" : "n/a",
      };
    });

  const allLocked = picks.filter((p) => classify(p) !== "unlocked").length;
  const allManual = picks.filter((p) => classify(p) === "manual").length;

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    season: SEASON_YEAR,
    summary: {
      users: users.length,
      weeksElapsed,
      totalPicks: picks.length,
      overallManualLockRate: allLocked ? round1((allManual / allLocked) * 100) + "%" : "n/a",
      note: "Browsing without picking is invisible here - see the route comment.",
    },
    perWeek,
    perUser,
  });
}
