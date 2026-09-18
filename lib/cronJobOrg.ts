// Reads next-scheduled-run times directly from cron-job.org's API (the
// source of truth for the actual schedule - see CLAUDE.md's Architecture
// section on why cron-job.org, not Vercel Cron, runs these jobs). Degrades
// to nulls (not an error) if CRONJOB_API_KEY isn't set or the API call
// fails, so a bad/missing key never breaks the rest of /admin.
type CronJobOrgJob = {
  jobId: number;
  enabled: boolean;
  title: string;
  url: string;
  lastStatus: number;
  lastExecution: number | null;
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

// cron-job.org's lastStatus enum: 0 = never executed yet, 1 = OK, anything
// else 2-9 is some flavor of failure (timeout, non-2xx, DNS, etc). Not
// worth mapping every code by name here - "failing" plus the raw code is
// enough to point a human at the cron-job.org dashboard for detail.
function statusLabel(lastStatus: number): string {
  if (lastStatus === 0) return "never executed";
  if (lastStatus === 1) return "ok";
  return `failing (status code ${lastStatus})`;
}

function toWwwUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "cavepicks.com") return null; // already www, or unrelated
    u.hostname = "www.cavepicks.com";
    return u.toString();
  } catch {
    return null;
  }
}

// One-time (but safe to re-run - it's a no-op once nothing's on bare apex
// anymore) fix for jobs created pointing at https://cavepicks.com instead
// of https://www.cavepicks.com. The apex 308-redirects to www (see
// CLAUDE.md), and cron-job.org doesn't treat that redirect as a successful
// execution, so any job left on apex silently never actually invokes the
// route - this is what caused the Sep 2026 pull-odds outage. Used by the
// "Fix cron job URLs" button on /admin (see app/admin/actions.ts).
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fixApexCronUrls(): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      fixed: { jobId: number; title: string; from: string; to: string }[];
      stillBroken: { jobId: number; title: string }[];
    }
> {
  const apiKey = process.env.CRONJOB_API_KEY;
  if (!apiKey) return { ok: false, error: "CRONJOB_API_KEY is not set" };

  const jobs = await fetchCronJobs();
  const toFix = jobs
    .map((job) => ({ job, newUrl: toWwwUrl(job.url) }))
    .filter((x): x is { job: CronJobOrgJob; newUrl: string } => x.newUrl !== null);

  for (const { job, newUrl } of toFix) {
    await fetch(`https://api.cron-job.org/jobs/${job.jobId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ job: { url: newUrl } }),
      cache: "no-store",
    });
    // Stay comfortably under cron-job.org's 5-req/sec write limit.
    await sleep(250);
  }

  // Re-fetch and check actual current state rather than trusting each
  // response code - a rate-limited response doesn't necessarily mean the
  // write didn't land, and trusting response codes alone previously
  // under-reported a fully-successful run as only 3/18 fixed.
  const after = await fetchCronJobs();
  const afterById = new Map(after.map((j) => [j.jobId, j]));

  const fixed: { jobId: number; title: string; from: string; to: string }[] = [];
  const stillBroken: { jobId: number; title: string }[] = [];
  for (const { job, newUrl } of toFix) {
    if (afterById.get(job.jobId)?.url === newUrl) {
      fixed.push({ jobId: job.jobId, title: job.title, from: job.url, to: newUrl });
    } else {
      stillBroken.push({ jobId: job.jobId, title: job.title });
    }
  }

  return { ok: true, fixed, stillBroken };
}

// Diagnostic dump for the jobs that hit this app - used by
// /api/debug-cronjob-status. Only returns jobs whose URL points at
// cavepicks.com (the account may have unrelated jobs for other projects),
// and never the API key itself.
export async function getCronJobDiagnostics() {
  const apiKey = process.env.CRONJOB_API_KEY;
  if (!apiKey) {
    return { ok: false as const, error: "CRONJOB_API_KEY is not set" };
  }

  const jobs = await fetchCronJobs();
  const relevant = jobs.filter((j) => j.url.includes("cavepicks.com"));

  return {
    ok: true as const,
    jobCount: relevant.length,
    jobs: relevant.map((j) => ({
      jobId: j.jobId,
      title: j.title,
      url: j.url,
      enabled: j.enabled,
      status: statusLabel(j.lastStatus),
      lastExecution: j.lastExecution ? new Date(j.lastExecution * 1000).toISOString() : null,
      nextExecution: j.nextExecution ? new Date(j.nextExecution * 1000).toISOString() : null,
    })),
  };
}

type HistoryItem = {
  identifier: string;
  date: number;
  httpStatus: number;
  status: number;
  duration: number;
};

// Full detail (headers/body) for one execution - cron-job.org only
// populates these on the single-item endpoint, not the list. Used to see
// what the target actually sent back on a failing execution (e.g. a
// firewall/challenge page's status+body), which the job list's bare
// "status code" alone can't show.
export async function getJobExecutionDetail(jobId: number, identifier: string) {
  const apiKey = process.env.CRONJOB_API_KEY;
  if (!apiKey) return { ok: false as const, error: "CRONJOB_API_KEY is not set" };

  try {
    const res = await fetch(`https://api.cron-job.org/jobs/${jobId}/history/${identifier}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false as const, error: `cron-job.org returned ${res.status}` };
    const data = await res.json();
    return { ok: true as const, detail: data?.jobHistoryDetails ?? data };
  } catch (err: any) {
    return { ok: false as const, error: err.message };
  }
}

// Recent execution history (list) for one job - includes the real
// httpStatus the target returned, not just cron-job.org's own status enum.
export async function getJobHistory(jobId: number, limit = 5) {
  const apiKey = process.env.CRONJOB_API_KEY;
  if (!apiKey) return { ok: false as const, error: "CRONJOB_API_KEY is not set" };

  try {
    const res = await fetch(`https://api.cron-job.org/jobs/${jobId}/history`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false as const, error: `cron-job.org returned ${res.status}` };
    const data = await res.json();
    const items: HistoryItem[] = Array.isArray(data?.history) ? data.history : [];
    return {
      ok: true as const,
      history: items.slice(0, limit).map((h) => ({
        identifier: h.identifier,
        date: new Date(h.date * 1000).toISOString(),
        httpStatus: h.httpStatus,
        status: statusLabel(h.status),
        durationMs: h.duration,
      })),
    };
  } catch (err: any) {
    return { ok: false as const, error: err.message };
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
