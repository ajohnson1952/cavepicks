import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getOrCreateCurrentWeek } from "@/lib/currentWeek";
import {
  adminLogin,
  adminLogout,
  voidGame,
  unvoidGame,
  setManualScore,
  adminUnlockPick,
  runGradeResultsNow,
  runPullOddsNow,
  mergeDuplicateGame,
  bulkUnlockStaleLocks,
  fixCronJobUrls,
} from "./actions";
import { formatSpread } from "@/lib/format";
import { getJobRuns } from "@/lib/jobRun";
import { getNextScheduledRuns } from "@/lib/cronJobOrg";

// Hardcoded rather than derived from the request - this app has one fixed
// live domain (see CLAUDE.md), not a multi-environment setup.
const SITE_URL = "https://www.cavepicks.com";

function jobRunDisplay(run: { ranAt: Date; trigger: string; ok: boolean; summary: string } | null): string {
  if (!run) return "never run";
  const when = run.ranAt.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const via = run.trigger === "cron" ? "auto" : "manual";
  return `${when} CT · ${via}${run.ok ? "" : " — FAILED"} · ${run.summary}`;
}

function nextRunDisplay(next: Date | null): string | null {
  if (!next) return null;
  const when = next.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  return `next scheduled: ${when} CT`;
}

export const dynamic = "force-dynamic";

export default async function AdminPage(
  props: {
    searchParams: Promise<{ week?: string; showAll?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const session = (await cookies()).get("admin_session")?.value;
  const isAuthed = session === "authenticated";

  if (!isAuthed) {
    return (
      <main>
        <h1>Admin</h1>
        <p className="subtext">Enter the admin password to manage games.</p>
        <form action={adminLogin}>
          <input
            type="password"
            name="password"
            placeholder="Admin password"
            className="admin-input"
            style={{ width: "100%", marginBottom: "8px" }}
          />
          <button type="submit" className="btn btn-lock" style={{ width: "auto" }}>
            Log in
          </button>
        </form>
      </main>
    );
  }

  const currentWeek = await getOrCreateCurrentWeek();
  const allWeeksMeta = await prisma.week.findMany({
    where: { seasonYear: 2026 },
    orderBy: { weekNumber: "asc" },
  });
  const minWeek = allWeeksMeta[0]?.weekNumber ?? currentWeek.weekNumber;
  const maxWeek = allWeeksMeta[allWeeksMeta.length - 1]?.weekNumber ?? currentWeek.weekNumber;

  const requestedWeekNumber = searchParams.week ? Number(searchParams.week) : currentWeek.weekNumber;
  const weekNumber = Math.max(minWeek, Math.min(maxWeek, requestedWeekNumber));
  const week = allWeeksMeta.find((w) => w.weekNumber === weekNumber);

  const showAll = searchParams.showAll === "1";

  const allGames = week
    ? await prisma.game.findMany({ where: { weekId: week.id }, orderBy: { commenceTime: "asc" } })
    : [];
  const games = showAll ? allGames : allGames.filter((g) => !g.isFinal || g.voided);
  const hiddenCount = allGames.length - games.length;

  const lockedPicks = week
    ? await prisma.pick.findMany({
        where: { gameId: { in: games.map((g) => g.id) }, locked: true },
        include: { user: true },
        orderBy: [{ user: { name: "asc" } }, { pickType: "asc" }],
      })
    : [];
  const lockedByGame = new Map<string, typeof lockedPicks>();
  for (const p of lockedPicks) {
    const arr = lockedByGame.get(p.gameId) ?? [];
    arr.push(p);
    lockedByGame.set(p.gameId, arr);
  }

  const [gradeRun, pullRun, cronFixRun] = await getJobRuns(["grade-results", "pull-odds", "fix-cronjob-urls"]);
  const nextRuns = await getNextScheduledRuns();
  const allUsers = await prisma.user.findMany({ orderBy: { name: "asc" } });

  return (
    <main>
      <div className="row-between">
        <h1>Admin</h1>
        <form action={adminLogout}>
          <button type="submit" className="btn btn-ghost">
            Log out
          </button>
        </form>
      </div>
      <p className="subtext">Void postponed/cancelled games, or manually fix a score.</p>

      <div className="card">
        <div className="matchup">Player links</div>
        <div className="divider" />
        <p style={{ fontSize: "13px", margin: "0 0 8px" }}>
          Each player's own link - the "My Picks" nav shortcut only works once their browser has
          opened this at least once (it's saved to that browser via localStorage, tied to this
          domain - moving domains, like the Render-&gt;Vercel move, means everyone needs their link
          again for that shortcut to come back).
        </p>
        {allUsers.map((u) => (
          <p key={u.id} style={{ fontSize: "13px", margin: "0 0 4px" }}>
            <strong>{u.name}:</strong>{" "}
            <span className="mono" style={{ userSelect: "all" }}>
              {SITE_URL}/pick/{u.pickSlug}
            </span>
          </p>
        ))}
      </div>

      <div className="card">
        <div className="matchup">Background jobs</div>
        <div className="divider" />
        <div style={{ marginBottom: "10px" }}>
          <div className="meta" style={{ marginBottom: "4px" }}>Grade results</div>
          <p style={{ fontSize: "13px", margin: "0 0 2px" }}>{jobRunDisplay(gradeRun)}</p>
          {nextRunDisplay(nextRuns.gradeResults) && (
            <p style={{ fontSize: "12px", margin: "0 0 6px", opacity: 0.7 }}>
              {nextRunDisplay(nextRuns.gradeResults)}
            </p>
          )}
          <form action={runGradeResultsNow}>
            <button type="submit" className="btn btn-lock" style={{ width: "auto" }}>
              Run grading now
            </button>
          </form>
        </div>
        <div>
          <div className="meta" style={{ marginBottom: "4px" }}>Pull odds</div>
          <p style={{ fontSize: "13px", margin: "0 0 2px" }}>{jobRunDisplay(pullRun)}</p>
          {nextRunDisplay(nextRuns.pullOdds) && (
            <p style={{ fontSize: "12px", margin: "0 0 6px", opacity: 0.7 }}>
              {nextRunDisplay(nextRuns.pullOdds)}
            </p>
          )}
          <form action={runPullOddsNow}>
            <button type="submit" className="btn btn-lock" style={{ width: "auto" }}>
              Pull odds now
            </button>
          </form>
        </div>
        <div style={{ marginTop: "10px" }}>
          <div className="meta" style={{ marginBottom: "4px" }}>Fix cron jobs (apex URLs + accidentally-disabled)</div>
          <p style={{ fontSize: "13px", margin: "0 0 6px" }}>{jobRunDisplay(cronFixRun)}</p>
          <form action={fixCronJobUrls}>
            <button type="submit" className="btn btn-ghost">
              Fix cron jobs
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="matchup">Unlock stale locks</div>
        <div className="divider" />
        <p style={{ fontSize: "13px", margin: "0 0 8px" }}>
          If pull-odds went quiet for a stretch (check <span className="mono">/api/debug-cron-history</span>),
          picks locked during that gap got a stale line. This unlocks every currently-locked pick in the given
          week whose lock time is before the cutoff below, so those players can re-lock fresh.
        </p>
        <form action={bulkUnlockStaleLocks} style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="number"
            name="weekNumber"
            defaultValue={weekNumber}
            className="admin-input"
            style={{ width: "70px" }}
            aria-label="Week number"
          />
          <input type="datetime-local" name="cutoff" className="admin-input" aria-label="Unlock everything locked before" />
          <button type="submit" className="btn btn-ghost">
            Unlock picks locked before this
          </button>
        </form>
      </div>

      <div className="row-between" style={{ marginBottom: "12px" }}>
        <a href={`/admin?week=${weekNumber - 1}`} className="btn" style={{ visibility: weekNumber > minWeek ? "visible" : "hidden" }}>
          &larr; Prev
        </a>
        <strong>Week {weekNumber}</strong>
        <a href={`/admin?week=${weekNumber + 1}`} className="btn" style={{ visibility: weekNumber < maxWeek ? "visible" : "hidden" }}>
          Next &rarr;
        </a>
      </div>

      {!week && <p className="subtext">No week {weekNumber} found.</p>}

      {week && (
        <p className="subtext">
          {hiddenCount > 0 && !showAll
            ? `Showing ${games.length} game(s) needing attention (${hiddenCount} already-final games hidden). `
            : ""}
          <a href={`/admin?week=${weekNumber}${showAll ? "" : "&showAll=1"}`}>
            {showAll ? "Hide already-final games" : "Show all games"}
          </a>
        </p>
      )}

      {games.map((g) => (
        <div key={g.id} className="card">
          <div className="matchup">
            {g.awayLogo && (
              <img
                src={g.awayLogo}
                alt={g.awayTeam}
                style={{ width: "16px", height: "16px", objectFit: "contain", verticalAlign: "-3px", marginRight: "5px" }}
              />
            )}
            {g.awayAbbr ?? g.awayTeam} @{" "}
            {g.homeLogo && (
              <img
                src={g.homeLogo}
                alt={g.homeTeam}
                style={{ width: "16px", height: "16px", objectFit: "contain", verticalAlign: "-3px", marginRight: "5px" }}
              />
            )}
            {g.homeAbbr ?? g.homeTeam}
          </div>
          <div className="meta">{g.awayTeam} @ {g.homeTeam}</div>
          <div className="meta">
            {g.commenceTime.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" })}{" "}
            CT
          </div>
          <div className="meta" style={{ marginTop: "4px" }}>
            Status:{" "}
            {g.voided
              ? `Voided \u2014 ${g.voidReason}`
              : g.isFinal
              ? `Final ${g.awayScore}\u2013${g.homeScore}`
              : "Not final"}
          </div>

          <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap", alignItems: "center" }}>
            {!g.voided ? (
              <form action={voidGame} style={{ display: "flex", gap: "6px" }}>
                <input type="hidden" name="gameId" value={g.id} />
                <input type="text" name="reason" placeholder="Reason (optional)" className="admin-input" style={{ width: "140px" }} />
                <button type="submit" className="btn">
                  Mark Postponed
                </button>
              </form>
            ) : (
              <form action={unvoidGame}>
                <input type="hidden" name="gameId" value={g.id} />
                <button type="submit" className="btn">
                  Un-void
                </button>
              </form>
            )}

            <form action={setManualScore} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <input type="hidden" name="gameId" value={g.id} />
              <input
                type="number"
                name="awayScore"
                placeholder="Away"
                defaultValue={g.awayScore ?? ""}
                className="admin-input"
                style={{ width: "60px" }}
              />
              <input
                type="number"
                name="homeScore"
                placeholder="Home"
                defaultValue={g.homeScore ?? ""}
                className="admin-input"
                style={{ width: "60px" }}
              />
              <button type="submit" className="btn btn-lock" style={{ width: "auto" }}>
                Save Score
              </button>
            </form>
          </div>

          <div className="meta" style={{ marginTop: "8px" }}>
            id: <span className="mono">{g.id}</span>
          </div>
          <form
            action={mergeDuplicateGame}
            style={{ display: "flex", gap: "6px", marginTop: "4px", alignItems: "center" }}
          >
            <input type="hidden" name="fromGameId" value={g.id} />
            <input
              type="text"
              name="toGameId"
              placeholder="Duplicate? Paste the correct game's id here"
              className="admin-input"
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-ghost">
              Merge picks in, void this
            </button>
          </form>

          {(lockedByGame.get(g.id) ?? []).length > 0 && (
            <div style={{ marginTop: "10px" }}>
              <div className="meta" style={{ marginBottom: "4px" }}>Locked picks</div>
              {(lockedByGame.get(g.id) ?? []).map((p) => {
                const num =
                  p.pickType === "DOG"
                    ? p.dogSpreadValue != null
                      ? ` (worth ${p.dogSpreadValue})`
                      : ""
                    : p.pickType === "SPREAD" && p.lockedLine != null
                    ? ` (${formatSpread(p.lockedLine)})`
                    : p.lockedLine != null
                    ? ` (${p.lockedLine})`
                    : "";
                return (
                  <form
                    key={p.id}
                    action={adminUnlockPick}
                    style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px", marginBottom: "3px" }}
                  >
                    <input type="hidden" name="pickId" value={p.id} />
                    <span style={{ flex: 1 }}>
                      {p.user.name} &middot; {p.pickType.toLowerCase()} {p.selection}
                      {num}
                      {p.graded ? (p.isWin ? " — won" : p.isPush ? " — push" : " — lost") : ""}
                    </span>
                    <button type="submit" className="btn btn-ghost">
                      Unlock
                    </button>
                  </form>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </main>
  );
}
