import { CURRENT_SEASON_YEAR } from "@/lib/careerStats";
import { loadSeason } from "@/lib/playerStats";
import { weekRecap, recapText, type Beat } from "@/lib/bragging";
import { fmtPts as pts, recText } from "@/lib/playerStats";
import WeekNav from "../WeekNav";
import { PlayerLink, PlayerNames } from "../PlayerLink";
import { PlayerLink as PlayerTag, PlayerNames as PlayerTags } from "../PlayerTag";
import { RecSpan } from "../players/parts";
import CopyRecap from "./CopyRecap";

export const metadata = { title: "Weekly Recap" };
export const dynamic = "force-dynamic";


function Item({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "8px", fontSize: "13px", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ width: "20px", flexShrink: 0, textAlign: "center" }}>{emoji}</span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}

function BeatLine({ b, lucky }: { b: Beat; lucky?: boolean }) {
  return (
    <>
      <PlayerLink name={b.user} /> &mdash; {b.pick}, {lucky ? "covered" : "missed"} by{" "}
      <strong className="mono">{pts(Math.abs(b.margin))}</strong>
      {b.score && <span className="meta"> &middot; {b.score}</span>}
    </>
  );
}

// The weekly recap: everything that happened in one week, plus a one-tap
// copy of the same thing as text for the group chat. Built entirely from the
// cached season load - visiting it doesn't wake the database.
export default async function RecapPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const sp = await searchParams;
  const data = await loadSeason(CURRENT_SEASON_YEAR);
  const lastSettled = [...data.weeks].reverse().find((w) => w.settled)?.week;
  const maxWeek = Math.max(1, data.currentWeek);
  const asked = Number(sp.week);
  const week = Number.isInteger(asked) && asked >= 1 && asked <= maxWeek ? asked : lastSettled ?? maxWeek;
  const r = weekRecap(data, week);
  const text = recapText(r);

  return (
    <main className="wide">
      <h1>Weekly Recap</h1>
      <WeekNav basePath="/recap" weekNumber={week} minWeek={1} maxWeek={maxWeek} isCurrent={week === data.currentWeek} />

      {r.players.every((p) => p.rec.n === 0 && !p.dog) ? (
        <div className="card">
          <p className="meta" style={{ margin: 0 }}>No locked picks this week yet.</p>
        </div>
      ) : (
        <>
          <CopyRecap text={text} />

          {r.pot && (
            <div className="card card-accent-money">
              <div className="matchup">🍕 The pot</div>
              <div className="stat-hero up">${r.pot.amount}</div>
              <p style={{ fontSize: "14px", margin: 0 }}>
                {!r.settled ? (
                  <span className="meta">Week still in progress.</span>
                ) : r.pot.leader ? (
                  <>
                    <strong><PlayerTag name={r.pot.leader} /></strong> takes it 🍕
                  </>
                ) : r.pot.tied.length && r.pot.payouts.length ? (
                  <>
                    <PlayerTags names={r.pot.tied} /> split it &mdash; ${r.pot.payouts[0].amount} each, ${r.pot.carryOut} rolls
                  </>
                ) : (
                  <>Nobody won it &mdash; ${r.pot.carryOut} rolls to next week</>
                )}
              </p>
            </div>
          )}

          <div className="card">
            <div className="matchup">📊 The week</div>
            <table className="stat-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Record</th>
                  <th>Dog</th>
                </tr>
              </thead>
              <tbody>
                {r.players.map((p, i) => (
                  <tr key={p.name} className={i === 0 && p.correct > 0 && r.settled ? "rank-first" : undefined}>
                    <td style={{ fontFamily: "inherit" }}>
                      <PlayerTag name={p.name} />
                      {r.sweeps.includes(p.name) && " 🧹"}
                      {r.geese.includes(p.name) && " 🥚"}
                    </td>
                    <td>{p.rec.n ? recText(p.rec) : <span className="meta">👻 no picks</span>}</td>
                    <td>
                      {!p.dog
                        ? "—"
                        : !p.dog.graded
                        ? "…"
                        : p.dog.win
                        ? <span className="pick-win">+{pts(p.dog.points)}</span>
                        : <span className="pick-loss">✗</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="meta" style={{ margin: "8px 0 0" }}>
              Cave: <RecSpan r={r.group} />
            </p>
          </div>

          <div className="card">
            <div className="matchup">🎬 Highlights</div>
            <div style={{ marginTop: "6px" }}>
              {r.dogHits.length > 0 ? (
                <Item emoji="🐕">
                  Dogs that barked:{" "}
                  {r.dogHits.map((d, i) => (
                    <span key={d.user}>
                      {i > 0 && ", "}
                      <PlayerLink name={d.user} /> ({d.team} +{pts(d.points)})
                    </span>
                  ))}
                </Item>
              ) : (
                r.settled && r.dogPicks > 0 && <Item emoji="🐕">All {r.dogPicks} dogs went to the pound.</Item>
              )}
              {r.badBeats.slice(0, 3).map((b, i) => (
                <Item key={`bad${i}`} emoji="😭">
                  <span className="meta">Bad beat: </span>
                  <BeatLine b={b} />
                </Item>
              ))}
              {r.lucky.slice(0, 3).map((b, i) => (
                <Item key={`lucky${i}`} emoji="🍀">
                  <span className="meta">Lucky: </span>
                  <BeatLine b={b} lucky />
                </Item>
              ))}
              {r.biggestWin && (
                <Item emoji="💪">
                  <span className="meta">Biggest cover: </span>
                  <PlayerLink name={r.biggestWin.user} /> &mdash; {r.biggestWin.pick} by{" "}
                  <strong className="mono">{pts(r.biggestWin.margin)}</strong>
                </Item>
              )}
              {r.worstMiss && (
                <Item emoji="🧱">
                  <span className="meta">Worst miss: </span>
                  <PlayerLink name={r.worstMiss.user} /> &mdash; {r.worstMiss.pick} by{" "}
                  <strong className="mono">{pts(-r.worstMiss.margin)}</strong>
                </Item>
              )}
              {r.consensus && (
                <Item emoji="🐑">
                  <span className="meta">Cave&apos;s favorite: </span>
                  {r.consensus.pick} ({r.consensus.count} of {r.consensus.of}) &mdash;{" "}
                  {r.consensus.result === "pending" ? (
                    <span className="meta">pending</span>
                  ) : r.consensus.result === "win" ? (
                    <span className="pick-win">cashed ✅</span>
                  ) : r.consensus.result === "push" ? (
                    <span className="pick-push">pushed</span>
                  ) : (
                    <span className="pick-loss">burned ❌</span>
                  )}
                </Item>
              )}
              {r.islands.length > 0 && (
                <Item emoji="🏝️">
                  <span className="meta">Lone wolf wins: </span>
                  {r.islands.map((x, i) => (
                    <span key={i}>
                      {i > 0 && ", "}
                      <PlayerLink name={x.user} />: {x.pick}
                    </span>
                  ))}
                </Item>
              )}
              {r.yahngo.with.n + r.yahngo.against.n > 0 && (
                <Item emoji="🤖">
                  <span className="meta">With Yahngo </span>
                  <RecSpan r={r.yahngo.with} /> <span className="meta">&middot; against </span>
                  <RecSpan r={r.yahngo.against} />
                </Item>
              )}
            </div>
          </div>

          {r.showdowns.length > 0 && (
            <div className="card">
              <div className="matchup">⚔️ Head-to-head</div>
              <p className="subtext" style={{ margin: "4px 0 6px" }}>Games where the cave split.</p>
              {r.showdowns.map((d, i) => (
                <Item key={i} emoji={d.push ? "🤝" : "🥊"}>
                  {d.push ? (
                    <>
                      <PlayerNames names={[...d.winners, ...d.losers]} /> pushed
                    </>
                  ) : (
                    <>
                      <strong>
                        <PlayerNames names={d.winners} />
                      </strong>{" "}
                      beat <PlayerNames names={d.losers} />
                    </>
                  )}
                  <span className="meta">
                    {" \u00b7 "}
                    {d.winPick} over {d.losePick}
                  </span>
                </Item>
              ))}
            </div>
          )}

          {(r.newKings.length > 0 || r.newTrophies.length > 0 || r.hot.length > 0 || r.cold.length > 0) && (
            <div className="card">
              <div className="matchup">📰 News</div>
              <div style={{ marginTop: "6px" }}>
                {r.newKings.map((k) => (
                  <Item key={k.conf} emoji="👑">
                    <strong><PlayerLink name={k.name} /></strong> is the new King of the {k.conf}
                    {k.from && (
                      <span className="meta">
                        {" "}
                        (dethroned <PlayerLink name={k.from} />)
                      </span>
                    )}
                  </Item>
                ))}
                {r.newTrophies.map((t, i) => (
                  <Item key={`t${i}`} emoji={t.trophy.emoji}>
                    <PlayerLink name={t.name} /> earned <strong>{t.trophy.name}</strong>
                    <span className="meta"> &middot; {t.trophy.desc.toLowerCase()}</span>
                  </Item>
                ))}
                {r.hot.length > 0 && (
                  <Item emoji="🚬">
                    Hot: <PlayerNames names={r.hot} />
                  </Item>
                )}
                {r.cold.length > 0 && (
                  <Item emoji="🧊">
                    Cold: <PlayerNames names={r.cold} />
                  </Item>
                )}
              </div>
            </div>
          )}

          {r.top3.length > 0 && (
            <div className="card">
              <div className="matchup">🏆 Season top 3 after Week {week}</div>
              <div style={{ marginTop: "6px" }}>
                {r.top3.map((t, i) => (
                  <Item key={t.name} emoji={["🥇", "🥈", "🥉"][i]}>
                    <PlayerTag name={t.name} /> <RecSpan r={t.rec} />
                  </Item>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
