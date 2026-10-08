import { computeCareer, CURRENT_SEASON_YEAR } from "@/lib/careerStats";
import { computeFunStats } from "@/lib/funStats";
import { computeGroupTrends } from "@/lib/groupTrends";
import { computeSharpness, MIN_SHARP_SAMPLE } from "@/lib/sharpness";

export const dynamic = "force-dynamic";

type SplitRecord = { wins: number; losses: number; pushes: number; pct: number; count: number };

// Two opposing splits (favorites vs underdogs, home vs road, over vs under):
// how OFTEN the group picks each side - the percentages and the two-tone bar -
// and underneath, how each side has actually done.
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
  const total = left.count + right.count;
  if (total === 0) return null;
  const leftShare = Math.round((left.count / total) * 100);
  const rightShare = 100 - leftShare;
  const record = (r: SplitRecord) =>
    r.count === 0 ? "none picked" : `hit ${r.pct.toFixed(1)}% (${r.wins}-${r.losses}${r.pushes > 0 ? `-${r.pushes}` : ""})`;
  return (
    <div className="split-row">
      <div className="row-between">
        <span>
          {leftLabel} <strong>{leftShare}%</strong>
        </span>
        <span>
          <strong>{rightShare}%</strong> {rightLabel}
        </span>
      </div>
      <div className="split-bar">
        <div style={{ width: `${leftShare}%` }} />
      </div>
      <div className="row-between meta">
        <span>{record(left)}</span>
        <span>{record(right)}</span>
      </div>
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

// Everything analytical about how the cave picks: Records, the Sharp Report,
// Behavior Awards and Group Trends. Split off /history (Oct 2026) so that
// page could go back to being just the leaderboards.
export default async function StatsPage() {
  // four independent reads - run together, not one after another
  const [{ bestSeason, worstSeason, careerWeeksLeader, careerDogLeader }, funStats, groupTrends, sharpAll] =
    await Promise.all([
      computeCareer(),
      computeFunStats(CURRENT_SEASON_YEAR),
      computeGroupTrends(CURRENT_SEASON_YEAR),
      computeSharpness(CURRENT_SEASON_YEAR),
    ]);
  const sharpRanked = sharpAll.filter((p) => p.wins + p.losses >= MIN_SHARP_SAMPLE);

  return (
    <main>
      <h1>Stats</h1>
      <p className="subtext">Records, who&apos;s sharp, and how the cave picks.</p>

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

      {sharpRanked.length >= 2 && (
        <div className="card">
          <div className="matchup">🔪 Sharp Report</div>
          <p className="subtext" style={{ margin: "4px 0 10px" }}>
            {CURRENT_SEASON_YEAR} &mdash; sharpest to squarest. Results <em>and</em> whether you got a better number than
            where the line closed.
          </p>
          {sharpRanked.map((p, i) => {
            const last = i === sharpRanked.length - 1;
            const badge = i === 0 ? "🔪" : last ? "🐑" : String(i + 1);
            return (
              <div
                key={p.name}
                style={{
                  padding: "8px 0",
                  borderBottom: last ? "none" : "1px solid var(--border)",
                }}
              >
                <div className="row-between" style={{ alignItems: "center" }}>
                  <span style={{ fontSize: "14px" }}>
                    <span style={{ display: "inline-block", width: "24px", textAlign: "center" }}>{badge}</span>
                    <strong>{p.name}</strong>
                    {i === 0 && <span className="meta"> &middot; sharpest</span>}
                    {last && <span className="meta"> &middot; squarest</span>}
                  </span>
                  <span className="mono" style={{ fontSize: "12px" }}>
                    {p.wins}-{p.losses}
                    {p.pushes ? `-${p.pushes}` : ""}
                    {p.avgClv != null && (
                      <span
                        className={p.avgClv > 0 ? "pick-win" : p.avgClv < 0 ? "pick-loss" : "pick-push"}
                        style={{ marginLeft: "8px" }}
                      >
                        {p.avgClv > 0 ? "+" : p.avgClv < 0 ? "\u2212" : ""}
                        {Math.abs(p.avgClv).toFixed(2)} CLV
                      </span>
                    )}
                  </span>
                </div>
                {p.withModel.picks + p.againstModel.picks > 0 && (
                  <div className="meta" style={{ marginLeft: "24px", marginTop: "2px" }}>
                    vs Yahngo: with it {p.withModel.wins}-{p.withModel.losses}
                    {" \u00b7 "}against it {p.againstModel.wins}-{p.againstModel.losses}
                  </div>
                )}
                {p.tags.length > 0 && (
                  <div style={{ marginLeft: "24px", marginTop: "3px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {p.tags.map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: "11px",
                          background: "var(--panel-alt)",
                          border: "1px solid var(--border-soft)",
                          borderRadius: "999px",
                          padding: "1px 7px",
                          color: "var(--dim)",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <p className="meta" style={{ margin: "8px 0 0", lineHeight: 1.5 }}>
            CLV = closing line value: how many points better (or worse) your locked number was than the final line
            before kickoff. Beating the close is the classic sign of a sharp. Ranked by results + CLV + dog points.
            Tiny sample &mdash; mostly bragging rights. &ldquo;vs Yahngo&rdquo; = your record on games where the
            yahngorithm model also had a pick, split by whether you took its side or the other one.
          </p>
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
          {CURRENT_SEASON_YEAR} only &mdash; how often the group takes each side (the percentages and bar), and how each
          side has done. Graded picks only.
        </p>

        <SplitCompareRow
          leftLabel="↔️ Spreads"
          left={groupTrends.spreadRecord}
          rightLabel="Totals ↕️"
          right={groupTrends.totalRecord}
        />
        <SplitCompareRow
          leftLabel="🟢 Favorites"
          left={groupTrends.favoriteRecord}
          rightLabel="Underdogs 🎲"
          right={groupTrends.underdogRecord}
        />
        <SplitCompareRow
          leftLabel="🏟️ Home picks"
          left={groupTrends.homeRecord}
          rightLabel="Road picks 🛣️"
          right={groupTrends.awayRecord}
        />
        <SplitCompareRow
          leftLabel="📈 Overs"
          left={groupTrends.overRecord}
          rightLabel="Unders 📉"
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
    </main>
  );
}
