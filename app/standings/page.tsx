import { dogPayouts } from "@/lib/pot";
import { computeCurrentSeasonStats } from "@/lib/seasonStats";
import { ghostSeasonStats, GHOST_NAME } from "@/lib/ghost";

export const dynamic = "force-dynamic";

function rankLabel(i: number): string {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return String(i + 1);
}

export default async function StandingsPage() {
  // Week 1 is the real start of the season - Week 0 was test/setup data and
  // never counted for money. Future weeks that already have a placeholder
  // row (because a marquee game's line posted early) don't count as "real"
  // yet either - only weeks up through the actual current week matter here.
  const { users, currentWeekNumber, weekResults, cavepicksStats, cavedogsStats } =
    await computeCurrentSeasonStats(2026);

  // The "current" week is the one matching today's actual date - not just
  // whichever week happens to be last in the list (that assumption broke
  // once future placeholder weeks started existing in the database).
  const currentWeek = weekResults.find((w) => w.weekNumber === currentWeekNumber) ?? null;
  const pastWeeks = weekResults.filter((w) => w.weekNumber !== currentWeekNumber);

  // "Yahn" the ghost player (the-yahngorithm's model playing along - see
  // lib/ghost.ts). Shown in both leaderboards where its record would rank,
  // but unranked and never part of the pot or the group totals. Wrapped so
  // the standings can't break if anything about it goes wrong.
  const ghost = await ghostSeasonStats(2026).catch(() => null);
  const ghostSideDenom = ghost ? ghost.side.wins + ghost.side.losses : 0;
  const ghostSidePct = ghostSideDenom > 0 ? (ghost!.side.wins / ghostSideDenom) * 100 : 0;
  const ghostDogDenom = ghost ? ghost.dog.wins + ghost.dog.losses : 0;
  const ghostDogPct = ghostDogDenom > 0 ? (ghost!.dog.wins / ghostDogDenom) * 100 : 0;
  // index of the first player the ghost is ahead of (or the end of the list)
  const ghostSideAt = ghost?.any
    ? ((i) => (i === -1 ? cavepicksStats.length : i))(cavepicksStats.findIndex((s) => s.pct < ghostSidePct))
    : -1;
  const ghostDogAt = ghost?.any
    ? ((i) => (i === -1 ? cavedogsStats.length : i))(cavedogsStats.findIndex((s) => s.points < ghost.dog.points))
    : -1;
  const ghostName = (
    <>
      <img
        src="/yahn-joe.png"
        alt=""
        width={15}
        height={15}
        style={{ borderRadius: "50%", verticalAlign: "-3px", marginRight: "5px" }}
      />
      <a href="/yahn" style={{ color: "inherit", textDecoration: "none" }}>
        {GHOST_NAME}
      </a>
      <span style={{ color: "var(--dim)", fontWeight: 400 }}> &middot; bot</span>
    </>
  );
  const ghostSideRow = ghost?.any ? (
    <tr key="ghost" style={{ opacity: 0.85 }}>
      <td className="rank-cell" style={{ color: "var(--dim)" }}>&ndash;</td>
      <td>{ghostName}</td>
      <td style={{ color: "var(--dim)" }}>&ndash;</td>
      <td>{ghost.side.wins}</td>
      <td>{ghost.side.pushes}</td>
      <td>{ghost.side.losses}</td>
      <td>{ghostSidePct.toFixed(1)}%</td>
    </tr>
  ) : null;
  const ghostDogRow = ghost?.any ? (
    <tr key="ghost" style={{ opacity: 0.85 }}>
      <td className="rank-cell" style={{ color: "var(--dim)" }}>&ndash;</td>
      <td>{ghostName}</td>
      <td>{ghost.dog.points}</td>
      <td>{ghost.dog.wins}</td>
      <td>{ghost.dog.losses}</td>
      <td>{ghostDogPct.toFixed(1)}%</td>
      <td style={{ color: "var(--dim)" }}>&mdash;</td>
    </tr>
  ) : null;

  const DOG_PAYOUTS = dogPayouts(users.length);
  const dogPotTotal = DOG_PAYOUTS.total;

  // Group totals - "how do we do as a group" rows at the bottom of each
  // leaderboard. Sum of every user's own wins/pushes/losses, not a
  // re-derivation - same numbers either way, this is just cheaper.
  const groupSideTotals = cavepicksStats.reduce(
    (acc, s) => ({ wins: acc.wins + s.wins, pushes: acc.pushes + s.pushes, losses: acc.losses + s.losses }),
    { wins: 0, pushes: 0, losses: 0 }
  );
  const groupSideDenom = groupSideTotals.wins + groupSideTotals.losses;
  const groupSidePct = groupSideDenom > 0 ? (groupSideTotals.wins / groupSideDenom) * 100 : 0;

  const groupDogTotals = cavedogsStats.reduce(
    (acc, s) => ({ points: acc.points + s.points, wins: acc.wins + s.wins, losses: acc.losses + s.losses }),
    { points: 0, wins: 0, losses: 0 }
  );
  const groupDogDenom = groupDogTotals.wins + groupDogTotals.losses;
  const groupDogPct = groupDogDenom > 0 ? (groupDogTotals.wins / groupDogDenom) * 100 : 0;

  return (
    <main>
      <h1>Standings</h1>
      <p className="subtext">Weekly pot, season records, and the dog race.</p>

      <div className="card card-accent-money">
        <div className="matchup">💰 Weekly Pot</div>
        {currentWeek ? (
          <>
            <div className="stat-hero">${currentWeek.potAmount}</div>
            <p className="subtext" style={{ margin: "0 0 0" }}>
              Week {currentWeek.weekNumber} &middot;{" "}
              {currentWeek.inProgress
                ? "in progress"
                : currentWeek.tiedLeaders.length > 0 && currentWeek.payouts.length > 0
                ? `${currentWeek.tiedLeaders.join(" & ")} tied - $${currentWeek.payouts[0].amount} each, $${currentWeek.carryOut} rolls`
                : currentWeek.rollover
                ? "tied - rolled over to next week"
                : `won by ${currentWeek.leader}`}{" "}
              &middot; <a href="/pot">balances</a>
            </p>
            <div className="divider" />
            {currentWeek.standings.map((s, i) => (
              <div key={s.name} className="row-between" style={{ fontSize: "13px", marginBottom: "4px" }}>
                <span>{s.name}</span>
                <span className="mono" style={{ color: i === 0 && s.correct > 0 ? "var(--up)" : "var(--dim)" }}>
                  {s.correct}/5
                </span>
              </div>
            ))}
          </>
        ) : (
          <p className="subtext" style={{ margin: "4px 0 0" }}>
            Season hasn&apos;t started yet &mdash; Week 1 begins Tuesday.
          </p>
        )}
      </div>

      <div className="card">
        <div className="matchup">📊 Cavepicks Leaderboard</div>
        <p className="subtext" style={{ margin: "4px 0 0" }}>Season record, spread &amp; total picks</p>
        <table className="stat-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Weeks</th>
              <th>W</th>
              <th>P</th>
              <th>L</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {cavepicksStats.flatMap((s, i) => [
              i === ghostSideAt ? ghostSideRow : null,
              <tr key={s.name} className={i === 0 && s.pct > 0 ? "rank-first" : undefined}>
                <td className="rank-cell">{rankLabel(i)}</td>
                <td>{s.name}</td>
                <td>{s.weeksWon}</td>
                <td>{s.wins}</td>
                <td>{s.pushes}</td>
                <td>{s.losses}</td>
                <td>{s.pct.toFixed(1)}%</td>
              </tr>,
            ])}
            {ghostSideAt === cavepicksStats.length ? ghostSideRow : null}
            <tr className="totals-row">
              <td></td>
              <td>Group Total</td>
              <td></td>
              <td>{groupSideTotals.wins}</td>
              <td>{groupSideTotals.pushes}</td>
              <td>{groupSideTotals.losses}</td>
              <td>{groupSidePct.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {pastWeeks.length > 0 && (
        <div className="card">
          <div className="matchup">📜 Pot History</div>
          <div className="divider" />
          {pastWeeks
            .slice()
            .reverse()
            .map((w) => (
              <div key={w.weekNumber} style={{ fontSize: "13px", marginBottom: "4px" }}>
                Week {w.weekNumber}:{" "}
                {w.inProgress ? (
                  <span className="meta">in progress</span>
                ) : w.tiedLeaders.length > 0 && w.payouts.length > 0 ? (
                  <span>
                    {w.tiedLeaders.join(" & ")} split <span className="mono">${w.payouts[0].amount}</span> each
                    <span className="meta"> &middot; ${w.carryOut} rolled</span>
                  </span>
                ) : w.rollover ? (
                  <span className="meta">tied, rolled over</span>
                ) : (
                  <span>
                    <span className="locked-badge" style={{ marginRight: "4px" }}>
                      <span className="locked-dot" />
                    </span>
                    {w.leader} won <span className="mono">${w.potAmount}</span>
                  </span>
                )}
              </div>
            ))}
        </div>
      )}

      <div className="card card-accent-dog">
        <div className="matchup">🐕 Cavedogs Leaderboard</div>
        <div className="stat-hero up">${dogPotTotal}</div>
        <p className="subtext" style={{ margin: "0 0 0" }}>
          Season-long &middot; ${DOG_PAYOUTS.first}/${DOG_PAYOUTS.second}/${DOG_PAYOUTS.third} to 1st/2nd/3rd at year&apos;s end
        </p>
        <table className="stat-table" style={{ marginTop: "10px" }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Pts</th>
              <th>W</th>
              <th>L</th>
              <th>%</th>
              <th>Payout</th>
            </tr>
          </thead>
          <tbody>
            {cavedogsStats.flatMap((s, i) => {
              const payout = i === 0 ? DOG_PAYOUTS.first : i === 1 ? DOG_PAYOUTS.second : i === 2 ? DOG_PAYOUTS.third : 0;
              return [
                i === ghostDogAt ? ghostDogRow : null,
                <tr key={s.name} className={i === 0 && s.points > 0 ? "rank-first" : undefined}>
                  <td className="rank-cell">{rankLabel(i)}</td>
                  <td>{s.name}</td>
                  <td>{s.points}</td>
                  <td>{s.wins}</td>
                  <td>{s.losses}</td>
                  <td>{s.pct.toFixed(1)}%</td>
                  <td>{payout > 0 && s.points > 0 ? `$${payout}` : "\u2014"}</td>
                </tr>,
              ];
            })}
            {ghostDogAt === cavedogsStats.length ? ghostDogRow : null}
            <tr className="totals-row">
              <td></td>
              <td>Group Total</td>
              <td>{groupDogTotals.points}</td>
              <td>{groupDogTotals.wins}</td>
              <td>{groupDogTotals.losses}</td>
              <td>{groupDogPct.toFixed(1)}%</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}
