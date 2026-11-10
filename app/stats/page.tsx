import { computeCareer, CURRENT_SEASON_YEAR } from "@/lib/careerStats";
import { computeFunStats } from "@/lib/funStats";
import { computeGroupTrends } from "@/lib/groupTrends";
import { computeSharpness, MIN_SHARP_SAMPLE } from "@/lib/sharpness";
import { conferenceBoard, fmtPts as pts, loadSeason } from "@/lib/playerStats";
import { TROPHIES, beats, curses, rivalries, trophiesFor } from "@/lib/bragging";
import { logoFor } from "@/lib/darkLogo";
import { pctText } from "../players/parts";
import { PlayerLink } from "@/app/PlayerLink";
import { PlayerLink as PlayerTag } from "@/app/PlayerTag";

export const metadata = { title: "Stats" };

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
  const [{ bestSeason, worstSeason, careerWeeksLeader, careerDogLeader }, funStats, groupTrends, sharpAll, season] =
    await Promise.all([
      computeCareer(),
      computeFunStats(CURRENT_SEASON_YEAR),
      computeGroupTrends(CURRENT_SEASON_YEAR),
      computeSharpness(CURRENT_SEASON_YEAR),
      loadSeason(CURRENT_SEASON_YEAR),
    ]);
  const confBoard = conferenceBoard(season);
  // bragging rights (lib/bragging.ts) - all from the same cached season load
  const rivalBoard = rivalries(season)
    .filter((r) => r.meetings >= 3)
    .sort((a, b) => b.aWins - b.bWins - (a.aWins - a.bWins) || b.meetings - a.meetings);
  const allBeats = beats(season.rows);
  const beatBoard = season.players
    .map((name) => ({
      name,
      bad: allBeats.bad.filter((b) => b.user === name).length,
      lucky: allBeats.lucky.filter((b) => b.user === name).length,
    }))
    .filter((x) => x.bad + x.lucky > 0)
    .sort((a, b) => b.bad - a.bad || a.lucky - b.lucky);
  const { kiss, midas } = curses(season);
  const trophyBoard = season.players
    .map((name) => ({ name, t: trophiesFor(season, name) }))
    .filter((x) => x.t.length > 0)
    .sort((a, b) => b.t.reduce((s, t) => s + t.weeks.length, 0) - a.t.reduce((s, t) => s + t.weeks.length, 0));
  const sharpRanked = sharpAll.filter((p) => p.wins + p.losses >= MIN_SHARP_SAMPLE);

  return (
    <main className="wide">
      <h1>Stats</h1>
      <p className="subtext">Records, who&apos;s sharp, and how the cave picks.</p>

      {(bestSeason || worstSeason || careerWeeksLeader || careerDogLeader) && (
        <div className="card">
          <div className="matchup">🏆 Records</div>
          <div className="divider" />
          {bestSeason && bestSeason.wins > 0 && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              Best season on record: <strong><PlayerTag name={bestSeason.name} /></strong> &mdash; {bestSeason.pct.toFixed(1)}%
              ({bestSeason.seasonLabel})
            </p>
          )}
          {worstSeason && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              Rock bottom: <strong><PlayerTag name={worstSeason.name} /></strong> &mdash; {worstSeason.pct.toFixed(1)}%
              ({worstSeason.seasonLabel})
            </p>
          )}
          {careerWeeksLeader && careerWeeksLeader.weeksWon > 0 && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              Most weeks won, all-time: <strong><PlayerTag name={careerWeeksLeader.name} /></strong> &mdash;{" "}
              {careerWeeksLeader.weeksWon}
            </p>
          )}
          {careerDogLeader && careerDogLeader.points > 0 && (
            <p style={{ fontSize: "13px", margin: "0" }}>
              Career Cavedogs points leader: <strong><PlayerTag name={careerDogLeader.name} /></strong> &mdash;{" "}
              {careerDogLeader.points} pts
            </p>
          )}
        </div>
      )}

      <a href="/players" className="card player-row" style={{ display: "flex", padding: "12px 16px" }}>
        <span>
          <strong>🚬 Who&apos;s hot &amp; who&apos;s not</strong>
          <span className="meta" style={{ display: "block", marginTop: "2px" }}>
            Everyone&apos;s last 3 weeks, trends and full pages live on the Players tab
          </span>
        </span>
        <span className="meta" aria-hidden="true" style={{ whiteSpace: "nowrap" }}>
          Players &rarr;
        </span>
      </a>

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
                    <strong><PlayerTag name={p.name} /></strong>
                    {i === 0 && <span className="meta"> &middot; sharpest 🚬</span>}
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

      {confBoard.length > 0 && (
        <div className="card">
          <div className="matchup">🏈 Conference kings</div>
          <p className="subtext" style={{ margin: "4px 0 0" }}>
            {CURRENT_SEASON_YEAR} &mdash; the king of each conference has the best record in it (5+ decided picks and a winning record to qualify). A spread counts for
            the team taken; a total for both teams&apos; conferences.
          </p>
          <table className="stat-table">
            <thead>
              <tr>
                <th>Conf</th>
                <th>Cave %</th>
                <th>👑 King</th>
                <th>🥶 Worst</th>
              </tr>
            </thead>
            <tbody>
              {confBoard.map((c) => (
                <tr key={c.conf}>
                  <td style={{ fontFamily: "inherit" }}>{c.conf}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{pctText(c.group)}</td>
                  <td>
                    {c.best ? (
                      <a href={`/players/${c.best.slug}`} className="player-link" style={{ color: "var(--up)", whiteSpace: "nowrap" }}>
                        {c.best.name} {pctText(c.best.rec)}
                      </a>
                    ) : (
                      "\u2014"
                    )}
                  </td>
                  <td>
                    {c.worst ? (
                      <a href={`/players/${c.worst.slug}`} className="player-link" style={{ color: "var(--down)", whiteSpace: "nowrap" }}>
                        {c.worst.name} {pctText(c.worst.rec)}
                      </a>
                    ) : (
                      "\u2014"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rivalBoard.length > 0 && (
        <div className="card">
          <div className="matchup">⚔️ Rivalries</div>
          <p className="subtext" style={{ margin: "4px 0 6px" }}>
            Head-to-head when two of you took opposite sides of the same game (3+ meetings). Most lopsided first.
          </p>
          {rivalBoard.slice(0, 8).map((r) => (
            <div key={`${r.a}${r.b}`} className="row-between" style={{ fontSize: "13px", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
              <span>
                <PlayerLink name={r.a} />{" "}
                <span className="meta">{r.aWins === r.bWins ? "even with" : r.aWins - r.bWins >= 3 ? "owns" : "leads"}</span>{" "}
                <PlayerLink name={r.b} />
              </span>
              <span className="mono">
                {r.aWins}-{r.bWins}
                {r.ties ? `-${r.ties}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {beatBoard.length > 0 && (
        <div className="card">
          <div className="matchup">😭 Bad beats &amp; 🍀 luck</div>
          <p className="subtext" style={{ margin: "4px 0 0" }}>Picks decided by a point or less, off the final score and the locked line.</p>
          <table className="stat-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>😭 Bad beats</th>
                <th>🍀 Lucky</th>
              </tr>
            </thead>
            <tbody>
              {beatBoard.map((x) => (
                <tr key={x.name}>
                  <td style={{ fontFamily: "inherit" }}>
                    <PlayerTag name={x.name} />
                  </td>
                  <td className="pick-loss">{x.bad}</td>
                  <td className="pick-win">{x.lucky}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {allBeats.bad[0] && (
            <p className="meta" style={{ margin: "8px 0 0", lineHeight: 1.45 }}>
              Most painful: <PlayerLink name={allBeats.bad[0].user} /> &mdash; {allBeats.bad[0].pick}, missed by{" "}
              {pts(-allBeats.bad[0].margin)} (Wk {allBeats.bad[0].week}
              {allBeats.bad[0].score ? `, ${allBeats.bad[0].score}` : ""})
            </p>
          )}
        </div>
      )}

      {(kiss.length > 0 || midas.length > 0) && (
        <div className="card">
          <div className="matchup">💋 Kiss of death</div>
          <p className="subtext" style={{ margin: "4px 0 6px" }}>
            Teams that never cover when a certain someone takes them (3+ picks). And the opposite.
          </p>
          {kiss.length === 0 && <p className="meta" style={{ margin: "0 0 4px" }}>Nobody&apos;s cursed a team yet.</p>}
          {kiss.map((k) => (
            <div key={`k${k.user}${k.team}`} className="row-between" style={{ fontSize: "13px", padding: "4px 0" }}>
              <span>
                💋 <PlayerLink name={k.user} /> <span className="meta">taking</span>{" "}
                {logoFor(k.logo) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoFor(k.logo)!} alt="" className="spirit-logo" />
                )}
                {k.team}
              </span>
              <span className="mono pick-loss">
                {k.w}-{k.l}
              </span>
            </div>
          ))}
          {midas.length > 0 && <p className="split-title" style={{ marginTop: "10px" }}>✨ Midas touch</p>}
          {midas.map((k) => (
            <div key={`m${k.user}${k.team}`} className="row-between" style={{ fontSize: "13px", padding: "4px 0" }}>
              <span>
                ✨ <PlayerLink name={k.user} /> <span className="meta">taking</span>{" "}
                {logoFor(k.logo) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoFor(k.logo)!} alt="" className="spirit-logo" />
                )}
                {k.team}
              </span>
              <span className="mono pick-win">
                {k.w}-{k.l}
              </span>
            </div>
          ))}
        </div>
      )}

      {trophyBoard.length > 0 && (
        <div className="card">
          <div className="matchup">🏆 Trophy room</div>
          <p className="subtext" style={{ margin: "4px 0 6px" }}>
            Everyone&apos;s hardware this season. Tap a name for their full trophy case.
          </p>
          {trophyBoard.map((x) => (
            <div key={x.name} style={{ fontSize: "13px", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
              <PlayerTag name={x.name} />
              <span style={{ marginLeft: "8px" }}>
                {x.t.map((t) => (
                  <span key={t.key} title={t.name} style={{ marginRight: "8px", whiteSpace: "nowrap" }}>
                    {t.emoji}
                    {t.weeks.length > 1 && <span className="mono meta">×{t.weeks.length}</span>}
                  </span>
                ))}
              </span>
            </div>
          ))}
          <p className="split-title" style={{ marginTop: "12px" }}>What they mean</p>
          {TROPHIES.map((t) => (
            <p key={t.key} className="meta" style={{ margin: "0 0 4px", lineHeight: 1.45 }}>
              {t.emoji} <strong style={{ color: "var(--ink)" }}>{t.name}</strong> &mdash; {t.desc}
            </p>
          ))}
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
              🌅 Early Bird: <strong><PlayerLink name={funStats.earlyBird.name} /></strong> &mdash; locks in an average of{" "}
              {Math.round(funStats.earlyBird.avgMinutesBefore / 60)}h before kickoff
            </p>
          )}
          {funStats.lastSecondLarry && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              ⏰ Last-Second Larry: <strong><PlayerLink name={funStats.lastSecondLarry.name} /></strong> &mdash; averages just{" "}
              {(funStats.lastSecondLarry.avgMinutesBefore / 60).toFixed(1)}h before kickoff
            </p>
          )}
          {funStats.buzzerBeater && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              🚨 Buzzer Beater record: <strong><PlayerLink name={funStats.buzzerBeater.name} /></strong> locked{" "}
              {funStats.buzzerBeater.game} just {Math.round(funStats.buzzerBeater.minutesBefore)} min before
              kickoff (Week {funStats.buzzerBeater.weekNumber})
            </p>
          )}
          {funStats.chalkLover && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              🟢 Chalk Lover: <strong><PlayerLink name={funStats.chalkLover.name} /></strong> &mdash; picks the favorite{" "}
              {funStats.chalkLover.pct.toFixed(0)}% of the time
            </p>
          )}
          {funStats.contrarian && funStats.contrarian.name !== funStats.chalkLover?.name && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              🎲 Contrarian: <strong><PlayerLink name={funStats.contrarian.name} /></strong> &mdash; only picks the favorite{" "}
              {funStats.contrarian.pct.toFixed(0)}% of the time
            </p>
          )}
          {funStats.homeCookin && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              🏟️ Home Cookin&apos;: <strong><PlayerLink name={funStats.homeCookin.name} /></strong> &mdash; takes the home team{" "}
              {funStats.homeCookin.pct.toFixed(0)}% of the time
            </p>
          )}
          {funStats.roadWarrior && funStats.roadWarrior.name !== funStats.homeCookin?.name && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              🛣️ Road Warrior: <strong><PlayerLink name={funStats.roadWarrior.name} /></strong> &mdash; only takes the home team{" "}
              {funStats.roadWarrior.pct.toFixed(0)}% of the time
            </p>
          )}
          {funStats.overLover && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              📈 Over Lover: <strong><PlayerLink name={funStats.overLover.name} /></strong> &mdash; takes the over{" "}
              {funStats.overLover.pct.toFixed(0)}% of the time (group average: {funStats.groupOverPct.toFixed(0)}%)
            </p>
          )}
          {funStats.underLover && funStats.underLover.name !== funStats.overLover?.name && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              📉 Under Lover: <strong><PlayerLink name={funStats.underLover.name} /></strong> &mdash; takes the over only{" "}
              {funStats.underLover.pct.toFixed(0)}% of the time
            </p>
          )}
          {funStats.ghostAward && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              👻 Ghost Award: <strong><PlayerLink name={funStats.ghostAward.name} /></strong> &mdash; missed a full slate of picks{" "}
              {funStats.ghostAward.missedWeeks} {funStats.ghostAward.missedWeeks === 1 ? "week" : "weeks"} this
              season
            </p>
          )}
          {funStats.flipFlopper && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              🔄 Flip-Flopper: <strong><PlayerLink name={funStats.flipFlopper.name} /></strong> &mdash; switched sides{" "}
              {funStats.flipFlopper.totalChanges} {funStats.flipFlopper.totalChanges === 1 ? "time" : "times"} before
              locking in this season
              {/* a per-pick rate only reads well once it's at least ~1 a pick;
                  below that it rounded to a silly "0.0x" */}
              {funStats.flipFlopper.avgChanges >= 0.95 &&
                ` (about ${funStats.flipFlopper.avgChanges.toFixed(1)}x per pick)`}
            </p>
          )}
          {funStats.quickDraw && (
            <p style={{ fontSize: "13px", margin: "0 0 6px" }}>
              ⚡ Quick Draw: <strong><PlayerLink name={funStats.quickDraw.name} /></strong> &mdash; locks a pick in just{" "}
              {Math.round(funStats.quickDraw.avgMinutes * 60)} sec after first selecting it, on average
            </p>
          )}
          {funStats.ponderer && funStats.ponderer.name !== funStats.quickDraw?.name && (
            <p style={{ fontSize: "13px", margin: "0" }}>
              🤔 Ponderer: <strong><PlayerLink name={funStats.ponderer.name} /></strong> &mdash; sits on a pick for{" "}
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
