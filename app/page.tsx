import { prisma } from "@/lib/db";
import { SEASON_YEAR } from "@/lib/currentWeek";
import { computeCurrentSeasonStats } from "@/lib/seasonStats";
import HomePicksButton from "./HomePicksButton";

export const dynamic = "force-dynamic";

const CT = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  d.toLocaleString("en-US", { timeZone: "America/Chicago", ...opts });

export default async function Home() {
  const { users, weekResults, currentWeekNumber } = await computeCurrentSeasonStats(SEASON_YEAR);
  const current = weekResults.find((w) => w.weekNumber === currentWeekNumber) ?? null;
  const lastWeek = weekResults.find((w) => w.weekNumber === currentWeekNumber - 1) ?? null;

  const week = await prisma.week.findUnique({
    where: { seasonYear_weekNumber: { seasonYear: SEASON_YEAR, weekNumber: currentWeekNumber } },
  });
  const picks = week
    ? await prisma.pick.findMany({
        where: { weekId: week.id, pickType: { in: ["SPREAD", "TOTAL"] } },
        include: { game: true },
      })
    : [];

  const lockedBy = new Map<string, number>();
  for (const p of picks) if (p.locked) lockedBy.set(p.userId, (lockedBy.get(p.userId) ?? 0) + 1);
  const lockRows = users
    .map((u) => ({ name: u.name, locked: lockedBy.get(u.id) ?? 0 }))
    .sort((a, b) => b.locked - a.locked || a.name.localeCompare(b.name));
  const allLocked = lockRows.every((r) => r.locked >= 5);

  const now = Date.now();
  const nextGame = picks
    .map((p) => p.game)
    .filter((g) => !g.voided && g.commenceTime.getTime() > now)
    .sort((a, b) => a.commenceTime.getTime() - b.commenceTime.getTime())[0];
  const onNextGame = nextGame ? new Set(picks.filter((p) => p.gameId === nextGame.id).map((p) => p.userId)).size : 0;

  const top = current?.standings[0]?.correct ?? 0;
  const leaders = current ? current.standings.filter((s) => s.correct === top && top > 0).map((s) => s.name) : [];

  return (
    <main>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <img src="/icon-192.png" alt="" width={56} height={56} style={{ borderRadius: "14px" }} />
        <div>
          {/* same wordmark as the top bar (.brand-name), just bigger */}
          <h1 className="brand-name" style={{ margin: "0 0 5px", fontSize: "22px" }} aria-label="Cavepicks">
            CAVE<span>PICKS</span>
          </h1>
          <p className="subtext" style={{ margin: 0 }}>
            {currentWeekNumber >= 1 ? `Week ${currentWeekNumber}` : "Preseason"} &middot;{" "}
            {CT(new Date(), { weekday: "long", month: "short", day: "numeric" })}
          </p>
        </div>
      </div>

      <HomePicksButton />

      {current && (
        <a href="/pot" className="card card-accent-money" style={{ display: "block", textDecoration: "none", color: "inherit", marginTop: "12px" }}>
          <div className="row-between">
            <div className="matchup">💰 This week&apos;s pot</div>
            <span className="meta">details &rarr;</span>
          </div>
          <div className="stat-hero">${current.potAmount}</div>
          <p className="subtext" style={{ margin: 0 }}>
            {current.inProgress
              ? leaders.length === 0
                ? "No picks graded yet."
                : leaders.length === 1
                ? `${leaders[0]} leads with ${top} correct so far.`
                : `${leaders.join(", ")} tied at ${top} correct so far.`
              : current.leader
              ? `${current.leader} won it.`
              : current.tiedLeaders.length > 0
              ? `${current.tiedLeaders.join(" & ")} tied. $${current.carryOut} rolls to next week.`
              : `Nobody hit - $${current.carryOut} rolls to next week.`}
            {current.carryIn > 0 && current.inProgress ? ` Includes $${current.carryIn} rolled over.` : ""}
          </p>
        </a>
      )}

      {nextGame && (
        <a href="/guide" className="card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
          <div className="row-between">
            <div className="matchup">⏱ Next up</div>
            <span className="meta">guide &rarr;</span>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: "14px", fontWeight: 700 }}>
            {nextGame.awayAbbr ?? nextGame.awayTeam} @ {nextGame.homeAbbr ?? nextGame.homeTeam}
          </p>
          <p className="meta" style={{ margin: "2px 0 0" }}>
            {CT(nextGame.commenceTime, { weekday: "short", hour: "numeric", minute: "2-digit" })} CT
            {nextGame.broadcast ? ` · ${nextGame.broadcast}` : ""} &middot; {onNextGame} player{onNextGame === 1 ? "" : "s"} on it
          </p>
        </a>
      )}

      {current && (
        <div className="card">
          <div className="row-between">
            <div className="matchup">🔒 Locked in</div>
            <a href="/board" className="meta" style={{ textDecoration: "none" }}>
              board &rarr;
            </a>
          </div>
          {allLocked ? (
            <p className="subtext" style={{ margin: "6px 0 0" }}>Everyone&apos;s locked all 5. 🔥</p>
          ) : (
            <div style={{ marginTop: "8px" }}>
              {lockRows.map((r) => (
                <div key={r.name} className="row-between" style={{ fontSize: "13px", marginBottom: "3px" }}>
                  <span>{r.name}</span>
                  <span className="mono" style={{ color: r.locked >= 5 ? "var(--up)" : "var(--dim)" }}>
                    {r.locked}/5
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {lastWeek && !lastWeek.inProgress && (
        <div className="card">
          <div className="matchup">🏁 Last week</div>
          <p style={{ margin: "6px 0 0", fontSize: "13px" }}>
            {lastWeek.leader
              ? `${lastWeek.leader} won $${lastWeek.potAmount} with ${lastWeek.standings[0]?.correct}/5.`
              : lastWeek.tiedLeaders.length > 0 && lastWeek.payouts.length > 0
              ? `${lastWeek.tiedLeaders.join(" & ")} tied at ${lastWeek.standings[0]?.correct}/5 and split $${lastWeek.payouts[0].amount} each.`
              : lastWeek.tiedLeaders.length > 0
              ? `${lastWeek.tiedLeaders.join(" & ")} tied at ${lastWeek.standings[0]?.correct}/5 - the pot rolled.`
              : "Nobody hit - the pot rolled."}
          </p>
        </div>
      )}

      {!current && (
        <p className="subtext">The season hasn&apos;t started yet &mdash; Week 1 begins Tuesday.</p>
      )}
    </main>
  );
}
