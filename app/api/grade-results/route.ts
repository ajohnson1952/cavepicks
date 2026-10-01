// app/api/grade-results/route.ts
import { NextResponse } from "next/server";
import { runGradeResults, summarizeGradeRun } from "@/lib/gradeResults";
import { recordJobRun } from "@/lib/jobRun";
import { toYyyymmdd } from "@/lib/espnScores";

export const dynamic = "force-dynamic";

// --- Neon compute saver ---------------------------------------------------
// cron-job.org hits this every 30 min, ~29x a day, every day. Each run used
// to query the database even on days with no football - and every query
// wakes Neon's compute for at least its 5-minute autosuspend window, so
// idle polling alone kept the database awake ~2.5 hours a day.
//
// So before touching the DB, ask ESPN's free scoreboard (no key, no DB)
// whether anything could possibly need grading: a game in progress, or one
// that kicked off in the last RECENT_KICKOFF_HOURS (so it may have just
// finished). If not, return without a single query and Neon stays asleep.
//
// Safety nets, so a missed game can't stay ungraded:
//  - any run before MORNING_SWEEP_BEFORE_HOUR Central always does the full
//    DB check (the 7:30am job) - catches anything the gate skipped
//  - if ESPN can't be reached, do the full check rather than guess
//  - ?force=1 always does the full check
//  - the admin "Run grading now" button calls runGradeResults() directly
//    and never goes through this gate
// A skipped run does NOT record a JobRun (that's a DB write), so /admin's
// "last ran" shows the last run that actually checked the database.
const RECENT_KICKOFF_HOURS = 8;
const MORNING_SWEEP_BEFORE_HOUR = 9;

async function espnSaysWorthChecking(): Promise<{ check: boolean; reason: string }> {
  const now = Date.now();
  // Today and yesterday (Central) - a late West-coast game can still be
  // going after midnight CT, filed under yesterday's date.
  const dates = [toYyyymmdd(new Date(now)), toYyyymmdd(new Date(now - 24 * 60 * 60 * 1000))];
  for (const d of dates) {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${d}`,
      { cache: "no-store" }
    );
    if (!res.ok) return { check: true, reason: `ESPN returned ${res.status} - checking the database to be safe` };
    const data = await res.json();
    for (const e of data.events ?? []) {
      const state = e.competitions?.[0]?.status?.type?.state;
      if (state === "in") return { check: true, reason: "a game is in progress" };
      const kickoff = new Date(e.date).getTime();
      if (kickoff <= now && kickoff >= now - RECENT_KICKOFF_HOURS * 60 * 60 * 1000) {
        return { check: true, reason: "a game kicked off recently" };
      }
    }
  }
  return { check: false, reason: "no games in progress or recently kicked off" };
}

function centralHour(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hour12: false }).format(new Date())
  ) % 24;
}

export async function GET(request: Request) {
  try {
    const force = new URL(request.url).searchParams.get("force") === "1";
    if (!force && centralHour() >= MORNING_SWEEP_BEFORE_HOUR) {
      let gate: { check: boolean; reason: string };
      try {
        gate = await espnSaysWorthChecking();
      } catch {
        gate = { check: true, reason: "ESPN unreachable - checking the database to be safe" };
      }
      if (!gate.check) {
        return NextResponse.json({ ok: true, skipped: true, reason: gate.reason });
      }
    }

    const result = await runGradeResults();
    await recordJobRun("grade-results", "cron", true, summarizeGradeRun(result));
    return NextResponse.json(result);
  } catch (err: any) {
    await recordJobRun("grade-results", "cron", false, err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
