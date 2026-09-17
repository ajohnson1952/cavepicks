// app/api/debug-cronjob-status/route.ts
// Diagnostic for "is cron-job.org actually calling this app": reads job
// status straight from cron-job.org's own API (enabled/disabled, last run
// outcome, next scheduled run) via lib/cronJobOrg.ts. Complements
// /api/debug-cron-history, which can only show whether pulls *landed*, not
// why cron-job.org didn't fire one - this shows the schedule/config side.
// Read-only, and CRONJOB_API_KEY (needed to call cron-job.org at all) is
// never included in the response.
import { NextResponse } from "next/server";
import { getCronJobDiagnostics } from "@/lib/cronJobOrg";

export const dynamic = "force-dynamic";

export async function GET() {
  const diagnostics = await getCronJobDiagnostics();
  return NextResponse.json(diagnostics);
}
