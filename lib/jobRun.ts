// lib/jobRun.ts
// Tracks the latest run of each background job (grade-results, pull-odds)
// so /admin can show "last ran: <time> · cron|manual · <summary>" and give
// the admin a "Run now" button. One row per job, always upserted in place -
// see the JobRun model comment in schema.prisma for why this isn't a log.
import { prisma } from "./db";

export type JobTrigger = "cron" | "manual";

export async function recordJobRun(jobName: string, trigger: JobTrigger, ok: boolean, summary: string) {
  await prisma.jobRun.upsert({
    where: { jobName },
    update: { trigger, ok, summary, ranAt: new Date() },
    create: { jobName, trigger, ok, summary },
  });
}

export async function getJobRuns(jobNames: string[]) {
  const rows = await prisma.jobRun.findMany({ where: { jobName: { in: jobNames } } });
  const byName = new Map(rows.map((r) => [r.jobName, r]));
  return jobNames.map((name) => byName.get(name) ?? null);
}
