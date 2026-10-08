import { computeCareer, CURRENT_SEASON_YEAR } from "@/lib/careerStats";

export const dynamic = "force-dynamic";

function rankLabel(i: number): string {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return String(i + 1);
}

// The pure record book: all-time and season-by-season leaderboards. Records,
// the Sharp Report, Behavior Awards and Group Trends live on /stats.
export default async function HistoryPage() {
  const {
    historicalRows, historicalSeasonYears, currentSide, currentDog, allTimeSide, allTimeDog,
    allTimeSideTotals, allTimeSidePct, allTimeDogTotals, allTimeDogPct,
  } = await computeCareer();

  return (
    <main>
      <h1>History</h1>
      <p className="subtext">
        Career totals and past seasons. Records, the Sharp Report, awards and trends are on{" "}
        <a href="/stats">Stats</a>.
      </p>

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
