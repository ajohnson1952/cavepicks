// app/api/grade-results/route.ts
import { NextResponse } from "next/server";
import { runGradeResults, summarizeGradeRun } from "@/lib/gradeResults";
import { recordJobRun } from "@/lib/jobRun";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await runGradeResults();
    await recordJobRun("grade-results", "cron", true, summarizeGradeRun(result));
    return NextResponse.json(result);
  } catch (err: any) {
    await recordJobRun("grade-results", "cron", false, err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
