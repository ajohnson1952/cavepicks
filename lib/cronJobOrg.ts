// Reads next-scheduled-run times directly from cron-job.org's API (the
// source of truth for the actual schedule - see CLAUDE.md's Architecture
// section on why cron-job.org, not Vercel Cron, runs these jobs). Degrades
// to nulls (not an error) if CRONJOB_API_KEY isn't set or the API call
// fails, so a bad/missing key never breaks the rest of /admin.
type CronJobOrgJob = {
  jobId: number;
  enabled: boolean;
  url: string;
  nextExecution: number | null;
};

async function fetchCronJobs(): Promise<CronJobOrgJob[]> {
  const apiKey = process.env.CRONJOB_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch("https://api.cron-job.org/jobs", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.jobs) ? (data.jobs as CronJobOrgJob[]) : [];
  } catch {
    return [];
  }
}

export async function getNextScheduledRuns(): Promise<{
  pullOdds: Date | null;
  gradeResults: Date | null;
}> {
  const jobs = await fetchCronJobs();

  const earliestNext = (urlFragment: string): Date | null => {
    const times = jobs
      .filter((j) => j.enabled && j.url.includes(urlFragment) && j.nextExecution)
      .map((j) => j.nextExecution as number);
    if (times.length === 0) return null;
    return new Date(Math.min(...times) * 1000);
  };

  return {
    pullOdds: earliestNext("/api/pull-odds"),
    gradeResults: earliestNext("/api/grade-results"),
  };
}
