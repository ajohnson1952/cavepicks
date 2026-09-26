import { prisma } from "@/lib/db";
import { computeCurrentSeasonStats } from "@/lib/seasonStats";
import { computeFunStats } from "@/lib/funStats";
import { computeGroupTrends } from "@/lib/groupTrends";

export const dynamic = "force-dynamic";

// The live season - the only one with real Game/Pick rows behind it.
// Everything before this comes from HistoricalSeasonRecord instead (see
// schema.prisma comment on that model for why).
const CURRENT_SEASON_YEAR = 2026;

// Below this many decisions (wins+losses), a season's win% is too small a
// sample to fairly call "best" or "worst" - mostly guards the current
// season early on, before a full slate of weeks has been graded.
const MIN_DECISIONS_FOR_RECORDS = 10;

function rankLabel(i: number): string {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return String(i + 1);
}

type SplitRecord = { wins: number; losses: number; pushes: number; pct: number; count: number };

// Side-by-side comparison of two opposing splits (favorites vs underdogs,
// home vs road, over vs under) - a compact "how does the group do on each
// side of this coin" row.
function SplitCompareRow({
  leftLabel,
  left,
  rightLabel,
  right,
}: {
  leftLabel: string;
  left: SplitRecord;
  rightLabel: string;
  right: SplitRecord;
}) {
  if (left.count === 0 && right.count === 0) return null;
  return (
    <div className="row-between" style={{ fontSize: "13px", margin: "0 0 8px" }}>
      <span>
        {leftLabel}: <strong>{left.pct.toFixed(1)}%</strong>{" "}
        <span className="subtext">
          ({left.wins}-{left.losses}
          {left.pushes > 0 ? `-${left.pushes}` : ""})
        </span>
      </span>
      <span>
        {rightLabel}: <strong>{right.pct.toFixed(1)}%</strong>{" "}
        <span className="subtext">
          ({right.wins}-{right.losses}
          {right.pushes > 0 ? `-${right.pushes}` : ""})
        </span>
      </span>
    </div>
  );
}

// A single horizontal bar for one week's group-wide pick accuracy - a quick
// visual read on hot/cold stretches across the season.
function WeekAccuracyBar({ weekNumber, correct, total, pct }: { weekNumber: number; correct: number; total: number; pct: number }) {
  const barColor = pct >= 55 ? "var(--up)" : pct <= 45 ? "var(--down)" : "var(--action)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "0 0 6px" }}>
      <span className="subtext" style={{ width: "44px", flexShrink: 0 }}>
        Wk {weekNumber}
      </span>
      <div style={{ flex: 1, background: "var(--border-soft)", borderRadius: "4px", height: "8px", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, pct)}%`, background: barColor, height: "100%", borderRadius: "4px" }} />
      </div>
      <span className="subtext" style={{ width: "68px", flexShrink: 0, textAlign: "right" }}>
        {correct}/{total} ({pct.toFixed(0)}%)
      </span>
    </div>
  );
}

export default async function HistoryPage() {
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const historicalRows = await prisma.historicalSeasonRecord.findMany({
    include: { user: true },
    orderBy: [{ seasonYear: "desc" }],
  });
  const { cavepicksStats: currentSide, cavedogsStats: currentDog } =
    await computeCurrentSeasonStats(CURRENT_SEASON_YEAR);
  const funStats = await computeFunStats(CURRENT_SEASON_YEAR);
  const groupTrends = await computeGroupTrends(CURRENT_SEASON_YEAR);

  const historicalSeasonYears = Array.from(new Set(historicalRows.map((r) => r.seasonYear))).sort(
    (a, b) => b - a
  );

  // --- All-time: every historical season's stored numbers + this season's live numbers, per user ---
  const allTimeSide = users
    .map((u) => {
      const historical = historicalRows.filter((r) => r.userId === u.id);
      const current = currentSide.find((s) => s.name === u.name);
      const weeksWon = historical.reduce((sum, r) => sum + r.weeksWon, 0) + (current?.weeksWon ?? 0);
      const wins = historical.reduce((sum, r) => sum + r.sideWins, 0) + (current?.wins ?? 0);
      const pushes = historical.reduce((sum, r) => sum + r.sidePushes, 0) + (current?.pushes ?? 0);
      const losses = historical.reduce((sum, r) => sum + r.sideLosses, 0) + (current?.losses ?? 0);
      const denom = wins + losses;
      const pct = denom > 0 ? (wins / denom) * 100 : 0;
      return { name: u.name, weeksWon, wins, pushes, losses, pct };
    })
    .sort((a, b) => b.pct - a.pct);

  const allTimeDog = users
    .map((u) => {
      const historical = historicalRows.filter((r) => r.userId === u.id);
      const current = currentDog.find((s) => s.name === u.name);
      const points = historical.reduce((sum, r) => sum + r.dogPoints, 0) + (current?.points ?? 0);
      const wins = historical.reduce((sum, r) => sum + r.dogWins, 0) + (current?.wins ?? 0);
      const losses = historical.reduce((sum, r) => sum + r.dogLosses, 0) + (current?.losses ?? 0);
      const denom = wins + losses;
      const pct = denom > 0 ? (wins / denom) * 100 : 0;
      return { name: u.name, points, wins, losses, pct };
    })
    .sort((a, b) => b.points - a.points);

  const allTimeSideTotals = allTimeSide.reduce(
    (acc, s) => ({ wins: acc.wins + s.wins, pushes: acc.pushes + s.pushes, losses: acc.losses + s.losses }),
    { wins: 0, pushes: 0, losses: 0 }
  );
  const allTimeSideDenom = allTimeSideTotals.wins + allTimeSideTotals.losses;
  const allTimeSidePct = allTimeSideDenom > 0 ? (allTimeSideTotals.wins / allTimeSideDenom) * 100 : 0;

  const allTimeDogTotals = allTimeDog.reduce(
    (acc, s) => ({ points: acc.points + s.points, wins: acc.wins + s.wins, losses: acc.losses + s.losses }),
    { points: 0, wins: 0, losses: 0 }
  );
  const allTimeDogDenom = allTimeDogTotals.wins + allTimeDogTotals.losses;
  const allTimeDogPct = allTimeDogDenom > 0 ? (allTimeDogTotals.wins / allTimeDogDenom) * 100 : 0;

  // --- Fun records: best/worst single-season win%, career weeks won, career dog points ---
  const allSeasonEntries = [
    ...historicalRows.map((r) => ({
      name: r.user.name,
      seasonLabel: String(r.seasonYear),
      wins: r.sideWins,
      losses: r.sideLosses,
      pct: r.sideWins + r.sideLosses > 0 ? (r.sideWins / (r.sideWins + r.sideLosses)) * 100 : 0,
    })),
    ...currentSide.map((s) => ({
      name: s.name,
      seasonLabel: `${CURRENT_SEASON_YEAR} (in progress)`,
      wins: s.wins,
      losses: s.losses,
      pct: s.pct,
    })),
  ].filter((e) => e.wins + e.losses >= MIN_DECISIONS_FOR_RECORDS);

  const bestSeason =
    allSeasonEntries.length > 0 ? allSeasonEntries.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const worstSeason =
    allSeasonEntries.length > 0 ? allSeasonEntries.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;
  const careerWeeksLeader =
    allTimeSide.length > 0 ? allTimeSide.reduce((a, b) => (b.weeksWon > a.weeksWon ? b : a)) : null;
  const careerDogLeader =
    allTimeDog.length > 0 ? allTimeDog.reduce((a, b) => (b.points > a.points ? b : a)) : null;

  return (
    <main>
      <h1>History</h1>
      <p className="subtext">Career totals and past seasons.</p>

      {(bestSeason || worstSeason || careerWeeksLeader || careerDogLeader) && (
        <div className="card">
          <div className="matchup">🏆 Records</div>
          <div className="divider" />
          {bestSeason && bestSeason.wins > 0 && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              Best season on record: <strong>{bestSeason.name}</strong> &mdash; {bestSeason.pct.toFixed(1)}%
              ({bestSeason.seasonLabel})
            </p>
          )}
          {worstSeason && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              Rock bottom: <strong>{worstSeason.name}</strong> &mdash; {worstSeason.pct.toFixed(1)}%
              ({worstSeason.seasonLabel})
            </p>
          )}
          {careerWeeksLeader && careerWeeksLeader.weeksWon > 0 && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              Most weeks won, all-time: <strong>{careerWeeksLeader.name}</strong> &mdash;{" "}
              {careerWeeksLeader.weeksWon}
            </p>
          )}
          {careerDogLeader && careerDogLeader.points > 0 && (
            <p style={{ fontSize: "13px", margin: "0" }}>
              Career Cavedogs points leader: <strong>{careerDogLeader.name}</strong> &mdash;{" "}
              {careerDogLeader.points} pts
            </p>
          )}
        </div>
      )}

      {(funStats.earlyBird ||
        funStats.lastSecondLarry ||
        funStats.buzzerBeater ||
        funStats.overLover ||
        funStats.chalkLover ||
        funStats.ghostAward ||
        funStats.flipFlopper ||
        funStats.homeCookin ||
        funStats.quickDraw) && (
        <div className="card">
          <div className="matchup">🎭 Behavior Awards</div>
          <p className="subtext" style={{ margin: "4px 0 10px" }}>
            {CURRENT_SEASON_YEAR} only &mdash; how everyone actually picks, not just how they score
          </p>
          {funStats.earlyBird && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              🌅 Early Bird: <strong>{funStats.earlyBird.name}</strong> &mdash; locks in an average of{" "}
              {Math.round(funStats.earlyBird.avgMinutesBefore / 60)}h before kickoff
            </p>
          )}
          {funStats.lastSecondLarry && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              ⏰ Last-Second Larry: <strong>{funStats.lastSecondLarry.name}</strong> &mdash; averages just{" "}
              {(funStats.lastSecondLarry.avgMinutesBefore / 60).toFixed(1)}h before kickoff
            </p>
          )}
          {funStats.buzzerBeater && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              🚨 Buzzer Beater record: <strong>{funStats.buzzerBeater.name}</strong> locked{" "}
              {funStats.buzzerBeater.game} just {Math.round(funStats.buzzerBeater.minutesBefore)} min before
              kickoff (Week {funStats.buzzerBeater.weekNumber})
            </p>
          )}
          {funStats.chalkLover && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              🟢 Chalk Lover: <strong>{funStats.chalkLover.name}</strong> &mdash; picks the favorite{" "}
              {funStats.chalkLover.pct.toFixed(0)}% of the time
            </p>
          )}
          {funStats.contrarian && funStats.contrarian.name !== funStats.chalkLover?.name && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              🎲 Contrarian: <strong>{funStats.contrarian.name}</strong> &mdash; only picks the favorite{" "}
              {funStats.contrarian.pct.toFixed(0)}% of the time
            </p>
          )}
          {funStats.homeCookin && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              🏟️ Home Cookin&apos;: <strong>{funStats.homeCookin.name}</strong> &mdash; takes the home team{" "}
              {funStats.homeCookin.pct.toFixed(0)}% of the time
            </p>
          )}
          {funStats.roadWarrior && funStats.roadWarrior.name !== funStats.homeCookin?.name && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              🛣️ Road Warrior: <strong>{funStats.roadWarrior.name}</strong> &mdash; only takes the home team{" "}
              {funStats.roadWarrior.pct.toFixed(0)}% of the time
            </p>
          )}
          {funStats.overLover && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              📈 Over Lover: <strong>{funStats.overLover.name}</strong> &mdash; takes the over{" "}
              {funStats.overLover.pct.toFixed(0)}% of the time (group average: {funStats.groupOverPct.toFixed(0)}%)
            </p>
          )}
          {funStats.underLover && funStats.underLover.name !== funStats.overLover?.name && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              📉 Under Lover: <strong>{funStats.underLover.name}</strong> &mdash; takes the over only{" "}
              {funStats.underLover.pct.toFixed(0)}% of the time
            </p>
          )}
          {funStats.ghostAward && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              👻 Ghost Award: <strong>{funStats.ghostAward.name}</strong> &mdash; missed a full slate of picks{" "}
              {funStats.ghostAward.missedWeeks} {funStats.ghostAward.missedWeeks === 1 ? "week" : "weeks"} this
              season
            </p>
          )}
          {funStats.flipFlopper && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              🔄 Flip-Flopper: <strong>{funStats.flipFlopper.name}</strong> &mdash; changes their mind{" "}
              {funStats.flipFlopper.avgChanges.toFixed(1)}x per pick on average ({funStats.flipFlopper.totalChanges}{" "}
              total changes this season)
            </p>
          )}
          {funStats.quickDraw && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              ⚡ Quick Draw: <strong>{funStats.quickDraw.name}</strong> &mdash; locks a pick in just{" "}
              {Math.round(funStats.quickDraw.avgMinutes * 60)} sec after first selecting it, on average
            </p>
          )}
          {funStats.ponderer && funStats.ponderer.name !== funStats.quickDraw?.name && (
            <p style={{ fontSize: "13px", margin: "0" }}>
              🤔 Ponderer: <strong>{funStats.ponderer.name}</strong> &mdash; sits on a pick for{" "}
              {Math.round(funStats.ponderer.avgMinutes / 60)}h on average before locking it in
            </p>
          )}
        </div>
      )}

      <div className="card">
        <div className="matchup">📈 Group Trends</div>
        <p className="subtext" style={{ margin: "4px 0 10px" }}>
          {CURRENT_SEASON_YEAR} only &mdash; how the group as a whole picks and performs
        </p>

        <SplitCompareRow
          leftLabel="🟢 Favorites (ATS)"
          left={groupTrends.favoriteRecord}
          rightLabel="🎲 Underdogs (ATS)"
          right={groupTrends.underdogRecord}
        />
        <SplitCompareRow
          leftLabel="🏟️ Home picks"
          left={groupTrends.homeRecord}
          rightLabel="🛣️ Road picks"
          right={groupTrends.awayRecord}
        />
        <SplitCompareRow
          leftLabel="📈 Overs"
          left={groupTrends.overRecord}
          rightLabel="📉 Unders"
          right={groupTrends.underRecord}
        />

        {groupTrends.mostPickedTeams.length > 0 && (
          <>
            <div className="divider" />
            <p style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 6px" }}>Most-picked teams (ATS)</p>
            <table className="stat-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th># Picks</th>
                  <th>Record</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {groupTrends.mostPickedTeams.map((t) => (
                  <tr key={t.team}>
                    <td>{t.team}</td>
                    <td>{t.count}</td>
                    <td>
                      {t.wins}-{t.losses}
                      {t.pushes > 0 ? `-${t.pushes}` : ""}
                    </td>
                    <td>{t.pct.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {groupTrends.weeklyAccuracy.length > 0 && (
          <>
            <div className="divider" />
            <p style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 8px" }}>Group accuracy by week</p>
            {groupTrends.weeklyAccuracy.map((w) => (
              <WeekAccuracyBar key={w.weekNumber} {...w} />
            ))}
          </>
        )}
      </div>

      <div className="card">
        <div className="matchup">📊 All-Time Cavepicks Leaderboard</div>
        <p className="subtext" style={{ margin: "4px 0 0" }}>Every season combined, spread &amp; total picks</p>
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
            {allTimeSide.map((s, i) => (
              <tr key={s.name} className={i === 0 && s.pct > 0 ? "rank-first" : undefined}>
                <td className="rank-cell">{rankLabel(i)}</td>
                <td>{s.name}</td>
                <td>{s.weeksWon}</td>
                <td>{s.wins}</td>
                <td>{s.pushes}</td>
                <td>{s.losses}</td>
                <td>{s.pct.toFixed(1)}%</td>
              </tr>
            ))}
            <tr className="totals-row">
              <td></td>
              <td>Group Total</td>
              <td></td>
              <td>{allTimeSideTotals.wins}</td>
              <td>{allTimeSideTotals.pushes}</td>
              <td>{allTimeSideTotals.losses}</td>
              <td>{allTimeSidePct.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card card-accent-dog">
        <div className="matchup">🐕 All-Time Cavedogs Leaderboard</div>
        <p className="subtext" style={{ margin: "4px 0 0" }}>Every season combined, dog picks</p>
        <table className="stat-table" style={{ marginTop: "10px" }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Pts</th>
              <th>W</th>
              <th>L</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {allTimeDog.map((s, i) => (
              <tr key={s.name} className={i === 0 && s.points > 0 ? "rank-first" : undefined}>
                <td className="rank-cell">{rankLabel(i)}</td>
                <td>{s.name}</td>
                <td>{s.points}</td>
                <td>{s.wins}</td>
                <td>{s.losses}</td>
                <td>{s.pct.toFixed(1)}%</td>
              </tr>
            ))}
            <tr className="totals-row">
              <td></td>
              <td>Group Total</td>
              <td>{allTimeDogTotals.points}</td>
              <td>{allTimeDogTotals.wins}</td>
              <td>{allTimeDogTotals.losses}</td>
              <td>{allTimeDogPct.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {historicalSeasonYears.length === 0 && (
        <p className="subtext">No past seasons on record yet &mdash; only {CURRENT_SEASON_YEAR} counts so far.</p>
      )}

      {historicalSeasonYears.map((year) => {
        const rows = historicalRows.filter((r) => r.seasonYear === year).sort((a, b) => {
          const aDenom = a.sideWins + a.sideLosses;
          const bDenom = b.sideWins + b.sideLosses;
          const aPct = aDenom > 0 ? a.sideWins / aDenom : 0;
          const bPct = bDenom > 0 ? b.sideWins / bDenom : 0;
          return bPct - aPct;
        });
        const seasonSideTotals = rows.reduce(
          (acc, r) => ({
            wins: acc.wins + r.sideWins,
            pushes: acc.pushes + r.sidePushes,
            losses: acc.losses + r.sideLosses,
          }),
          { wins: 0, pushes: 0, losses: 0 }
        );
        const seasonSideDenom = seasonSideTotals.wins + seasonSideTotals.losses;
        const seasonSidePct = seasonSideDenom > 0 ? (seasonSideTotals.wins / seasonSideDenom) * 100 : 0;

        const dogRows = [...rows].sort((a, b) => b.dogPoints - a.dogPoints);
        const seasonDogTotals = rows.reduce(
          (acc, r) => ({ points: acc.points + r.dogPoints, wins: acc.wins + r.dogWins, losses: acc.losses + r.dogLosses }),
          { points: 0, wins: 0, losses: 0 }
        );
        const seasonDogDenom = seasonDogTotals.wins + seasonDogTotals.losses;
        const seasonDogPct = seasonDogDenom > 0 ? (seasonDogTotals.wins / seasonDogDenom) * 100 : 0;

        return (
          <div key={year}>
            <div className="card">
              <div className="matchup">📊 {year} Cavepicks Leaderboard</div>
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
                  {rows.map((r, i) => {
                    const denom = r.sideWins + r.sideLosses;
                    const pct = denom > 0 ? (r.sideWins / denom) * 100 : 0;
                    return (
                      <tr key={r.id} className={i === 0 && pct > 0 ? "rank-first" : undefined}>
                        <td className="rank-cell">{rankLabel(i)}</td>
                        <td>{r.user.name}</td>
                        <td>{r.weeksWon}</td>
                        <td>{r.sideWins}</td>
                        <td>{r.sidePushes}</td>
                        <td>{r.sideLosses}</td>
                        <td>{pct.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                  <tr className="totals-row">
                    <td></td>
                    <td>Group Total</td>
                    <td></td>
                    <td>{seasonSideTotals.wins}</td>
                    <td>{seasonSideTotals.pushes}</td>
                    <td>{seasonSideTotals.losses}</td>
                    <td>{seasonSidePct.toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="card card-accent-dog">
              <div className="matchup">🐕 {year} Cavedogs Leaderboard</div>
              <table className="stat-table" style={{ marginTop: "10px" }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Pts</th>
                    <th>W</th>
                    <th>L</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {dogRows.map((r, i) => {
                    const denom = r.dogWins + r.dogLosses;
                    const pct = denom > 0 ? (r.dogWins / denom) * 100 : 0;
                    return (
                      <tr key={r.id} className={i === 0 && r.dogPoints > 0 ? "rank-first" : undefined}>
                        <td className="rank-cell">{rankLabel(i)}</td>
                        <td>{r.user.name}</td>
                        <td>{r.dogPoints}</td>
                        <td>{r.dogWins}</td>
                        <td>{r.dogLosses}</td>
                        <td>{pct.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                  <tr className="totals-row">
                    <td></td>
                    <td>Group Total</td>
                    <td>{seasonDogTotals.points}</td>
                    <td>{seasonDogTotals.wins}</td>
                    <td>{seasonDogTotals.losses}</td>
                    <td>{seasonDogPct.toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </main>
  );
}
