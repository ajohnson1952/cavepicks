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
  seedHistoricalSeason2025,
  recordPayment,
  deletePayment,
  settleAllOwing,
} from "./actions";
import { computeLedger } from "@/lib/ledger";
import { BANKER_NAME, isBanker } from "@/lib/pot";
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

  const [gradeRun, pullRun, cronFixRun, seedRun] = await getJobRuns([
    "grade-results",
    "pull-odds",
    "fix-cronjob-urls",
    "seed-historical-2025",
  ]);
  const nextRuns = await getNextScheduledRuns();
  const allUsers = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const ledger = await computeLedger(2026);

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

      <div className="card card-accent-money">
        <div className="matchup">Pot payments</div>
        <div className="divider" />
        <p style={{ fontSize: "13px", margin: "0 0 8px" }}>
          Record money as it changes hands - everyone sees the result on <a href="/pot">/pot</a>. Net
          balances: <strong>negative</strong> = they owe {BANKER_NAME}, <strong>positive</strong> = credit you&apos;re
          holding for them (winnings or a prepayment - it covers their next buy-ins automatically). For a prepayment,
          just record &quot;paid {BANKER_NAME}&quot; with the full amount. &quot;Cash out&quot; records paying their credit back.
        </p>
        {ledger.players
          .filter((p) => !isBanker(p.name))
          .map((p) => (
            <div key={p.userId} className="row-between" style={{ fontSize: "13px", marginBottom: "2px", alignItems: "center" }}>
              <span>{p.name}</span>
              <span style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span className="mono" style={{ color: p.balance < 0 ? "var(--down)" : p.balance > 0 ? "var(--action-soft)" : "var(--up)" }}>
                  {p.balance === 0 ? "settled" : p.balance < 0 ? `owes $${-p.balance}` : `credit $${p.balance}`}
                </span>
                {p.balance !== 0 && (
                  <form action={recordPayment}>
                    <input type="hidden" name="userId" value={p.userId} />
                    <input type="hidden" name="direction" value={p.balance < 0 ? "in" : "out"} />
                    <input type="hidden" name="amount" value={Math.abs(p.balance)} />
                    <input type="hidden" name="note" value={`Week ${ledger.currentWeekNumber} settle-up`} />
                    <button type="submit" className="btn btn-ghost">
                      {p.balance < 0 ? "mark paid" : "cash out"}
                    </button>
                  </form>
                )}
              </span>
            </div>
          ))}
        {ledger.players.some((p) => !isBanker(p.name) && p.balance < 0) && (
          <form action={settleAllOwing} style={{ marginTop: "8px" }}>
            <button type="submit" className="btn btn-lock" style={{ width: "auto", marginTop: 0 }}>
              Everyone who owes has paid
            </button>
          </form>
        )}
        <form action={recordPayment} style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
          <select name="userId" className="admin-input" required>
            {allUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select name="direction" className="admin-input">
            <option value="in">paid {BANKER_NAME}</option>
            <option value="out">{BANKER_NAME} paid them</option>
          </select>
          <input name="amount" type="number" min="1" step="1" placeholder="$" className="admin-input" style={{ width: "70px" }} required />
          <input name="note" placeholder="note (optional)" className="admin-input" style={{ flex: 1, minWidth: "120px" }} />
          <button type="submit" className="btn btn-lock" style={{ width: "auto", marginTop: 0 }}>
            Record
          </button>
        </form>
        {ledger.payments.length > 0 && (
          <>
            <div className="divider" />
            <div className="meta" style={{ marginBottom: "4px" }}>Recorded payments (delete to fix a mistake)</div>
            {ledger.payments.map((pm) => (
              <div key={pm.id} className="row-between" style={{ fontSize: "12px", marginBottom: "2px" }}>
                <span>
                  {pm.direction === "in" ? `${pm.user.name} paid ${BANKER_NAME}` : `${BANKER_NAME} paid ${pm.user.name}`} $
                  {pm.amount}
                  {pm.note ? ` · ${pm.note}` : ""}
                  <span className="meta">
                    {" "}
                    · {pm.createdAt.toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" })}
                  </span>
                </span>
                <form action={deletePayment}>
                  <input type="hidden" name="paymentId" value={pm.id} />
                  <button type="submit" className="btn btn-ghost">
                    delete
                  </button>
                </form>
              </div>
            ))}
          </>
        )}
      </div>

      <details className="card">
        <summary className="matchup" style={{ cursor: "pointer" }}>Player links</summary>
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
      </details>

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
      </div>

      <details className="card">
        <summary className="matchup" style={{ cursor: "pointer" }}>Maintenance tools</summary>
        <p className="meta" style={{ margin: "8px 0 0" }}>One-off fixes - rarely needed.</p>
        <div style={{ marginTop: "10px" }}>
          <div className="meta" style={{ marginBottom: "4px" }}>Fix cron jobs (apex URLs + accidentally-disabled)</div>
          <p style={{ fontSize: "13px", margin: "0 0 6px" }}>{jobRunDisplay(cronFixRun)}</p>
          <form action={fixCronJobUrls}>
            <button type="submit" className="btn btn-ghost">
              Fix cron jobs
            </button>
          </form>
        </div>
      <div style={{ marginTop: "14px" }}>
        <div className="meta" style={{ marginBottom: "4px", fontWeight: 700 }}>Historical data</div>
        <p style={{ fontSize: "13px", margin: "0 0 8px" }}>
          Seeds the 2025 season (hand-entered, pre-app) into <span className="mono">/history</span>. Safe to
          re-run - overwrites with the same numbers rather than duplicating.
        </p>
        <p style={{ fontSize: "13px", margin: "0 0 6px" }}>{jobRunDisplay(seedRun)}</p>
        <form action={seedHistoricalSeason2025}>
          <button type="submit" className="btn btn-ghost">
            Seed 2025 season
          </button>
        </form>
      </div>

      <div style={{ marginTop: "14px" }}>
        <div className="meta" style={{ marginBottom: "4px", fontWeight: 700 }}>Unlock stale locks</div>
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

      </details>

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
