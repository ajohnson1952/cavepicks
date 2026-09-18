// app/api/debug-cronjob-status/route.ts
// Diagnostic for "is cron-job.org actually calling this app": reads job
// status straight from cron-job.org's own API (enabled/disabled, last run
// outcome, next scheduled run) via lib/cronJobOrg.ts. Complements
// /api/debug-cron-history, which can only show whether pulls *landed*, not
// why cron-job.org didn't fire one - this shows the schedule/config side.
// Read-only, and CRONJOB_API_KEY (needed to call cron-job.org at all) is
// never included in the response.
//
// ?jobId=<id> adds that job's recent execution history (real HTTP status
// codes cron-job.org's target returned, not just its own status enum).
// ?jobId=<id>&identifier=<id> fetches one execution's full detail
// (response headers/body) - get the identifier from the history list first.
import { NextResponse } from "next/server";
import { getCronJobDiagnostics, getJobHistory, getJobExecutionDetail } from "@/lib/cronJobOrg";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobIdRaw = searchParams.get("jobId");
  const identifier = searchParams.get("identifier");

  if (jobIdRaw) {
    const jobId = Number(jobIdRaw);
    if (!Number.isFinite(jobId)) {
      return NextResponse.json({ ok: false, error: "jobId must be a number" }, { status: 400 });
    }
    if (identifier) {
      return NextResponse.json(await getJobExecutionDetail(jobId, identifier));
    }
    return NextResponse.json(await getJobHistory(jobId));
  }

  const diagnostics = await getCronJobDiagnostics();
  return NextResponse.json(diagnostics);
}
