import { notFound } from "next/navigation";
import { CURRENT_SEASON_YEAR } from "@/lib/careerStats";
import { buildProfile, findPlayer, loadSeason, playerSlug, MIN_SAMPLE, type Profile } from "@/lib/playerStats";
import { SpiritLogo, getSpirits, PlayerLink } from "../../PlayerTag";
import { TROPHIES, beats, curses, pickLabel, rivalsOf, trophiesFor } from "@/lib/bragging";
import { logoFor } from "@/lib/darkLogo";
import { ChartKey, FormBadge, RecSpan, SplitTable, TrendChart, VsRow, pctText, recText } from "../parts";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const data = await loadSeason(CURRENT_SEASON_YEAR);
  return { title: findPlayer(data, name) ?? "Player" };
}

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

function hoursText(h: number) {
  if (h < 24) return `${h.toFixed(1)} hours`;
  return `${(h / 24).toFixed(1)} days`;
}

function Line({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="row-between" style={{ fontSize: "13px", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

function Header({ p, career }: { p: Profile; career: { seasons: number; wins: number; losses: number; weeksWon: number; dogPoints: number } | null }) {
  const s = p.form.season;
  return (
    <div className="card">
      <div className="row-between" style={{ alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: 0 }}>
            <SpiritLogo name={p.name} />
            {p.name} <FormBadge status={p.form.status} seasonPct={p.form.season.pct} />
          </h1>
          <p className="subtext" style={{ margin: "2px 0 0" }}>
            {p.rank > 0 ? `${ordinal(p.rank)} of ${p.of}` : "unranked"} &middot; {CURRENT_SEASON_YEAR} season
          </p>
          {p.kings.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
              {p.kings.map((c) => (
                <span key={c} className="form-badge king">
                  👑 King of the {c}
                </span>
              ))}
            </div>
          )}
        </div>
        {p.form.streak && p.form.streak.count >= 2 && (
          <span className={`mono ${p.form.streak.kind === "W" ? "pick-win" : "pick-loss"}`} style={{ fontSize: "13px" }}>
            {p.form.streak.count}
            {p.form.streak.kind} streak{p.form.streak.kind === "W" && p.form.streak.count >= 3 ? " 🚬" : ""}
          </span>
        )}
      </div>
      <div className="stat-hero">{s.pct == null ? "—" : `${s.pct.toFixed(1)}%`}</div>
      <p className="subtext" style={{ margin: 0 }}>
        {recText(s)} on spreads &amp; totals &middot; last 3 weeks {recText(p.form.last3)} ({pctText(p.form.last3)})
      </p>
      <div className="player-tiles">
        <div>
          <span className="meta">Weeks won</span>
          <strong>{p.weeksWon}</strong>
        </div>
        <div>
          <span className="meta">🍕 Pots won</span>
          <strong>${p.potWon}</strong>
        </div>
        <div>
          <span className="meta">Dog points</span>
          <strong>{p.dog.points}</strong>
        </div>
        <div>
          <span className="meta">Best week</span>
          <strong>{p.bestWeek ? `${p.bestWeek.correct}/5` : "—"}</strong>
        </div>
      </div>
      {career && career.seasons > 1 && (
        <p className="meta" style={{ margin: "10px 0 0" }}>
          Career ({career.seasons} seasons): {career.wins}-{career.losses}
          {career.wins + career.losses > 0 && ` (${((career.wins / (career.wins + career.losses)) * 100).toFixed(1)}%)`}
          {" · "}
          {career.weeksWon} weeks won &middot; {career.dogPoints} dog pts
        </p>
      )}
    </div>
  );
}

export default async function PlayerPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: slug } = await params;
  const data = await loadSeason(CURRENT_SEASON_YEAR);
  const name = findPlayer(data, slug);
  if (!name) notFound();
  const p = buildProfile(data, name);
  const spirit = (await getSpirits()).get(name) ?? null;
  const trophies = trophiesFor(data, name);
  const rivals = rivalsOf(data, name);
  const myBeats = beats(data.rows.filter((r) => r.user === name));
  const { kiss, midas } = curses(data);
  const myKiss = kiss.filter((k) => k.user === name);
  const myMidas = midas.filter((k) => k.user === name);
  const pts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  const sideCount = p.form.season.n;

  return (
    <main className="wide">
      <p className="meta" style={{ margin: "0 0 8px" }}>
        <a href="/players">&larr; All players</a>
      </p>
      <Header p={p} career={p.career} />

      <div className="card">
        <div className="row-between">
          <div className="matchup">🏆 Trophy case</div>
          <span className="meta">
            {trophies.length} of {TROPHIES.length}
          </span>
        </div>
        <div className="trophy-grid">
          {TROPHIES.map((t) => {
            const won = trophies.find((x) => x.key === t.key);
            return (
              <div key={t.key} className={`trophy${won ? "" : " trophy-locked"}`}>
                <span className="trophy-emoji">{t.emoji}</span>
                <span className="trophy-name">
                  {t.name}
                  {won && won.weeks.length > 1 && <span className="trophy-count">{` \u00d7${won.weeks.length}`}</span>}
                </span>
                <span className="meta trophy-sub">{t.desc}</span>
                {won && <span className="trophy-weeks">Wk {won.weeks.join(", ")}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {sideCount === 0 ? (
        <div className="card">
          <p className="meta" style={{ margin: 0 }}>No locked picks yet this season.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="matchup">📈 Form</div>
            <TrendChart series={p.form.series} season={p.form.season.pct} />
            <ChartKey />
          </div>

          <div className="card">
            <div className="matchup">🧭 How they pick</div>
            <p className="subtext" style={{ margin: "4px 0 10px" }}>
              The bar is how often they take each side; the record underneath is how it&apos;s gone.
            </p>
            <VsRow leftLabel="↔️ Spreads" left={p.byType.spread} rightLabel="Totals ↕️" right={p.byType.total} />
            <VsRow leftLabel="🟢 Favorites" left={p.byType.fav} rightLabel="Underdogs 🎲" right={p.byType.dog} />
            <VsRow leftLabel="🏟️ Home" left={p.byType.home} rightLabel="Road 🛣️" right={p.byType.road} />
            <VsRow leftLabel="📈 Overs" left={p.byType.over} rightLabel="Unders 📉" right={p.byType.under} />
            <div className="divider" />
            <p className="split-title">Spread size</p>
            <SplitTable rows={p.lineSize} />
          </div>

          <div className="card">
            <div className="matchup">🏈 Conferences</div>
            <p className="subtext" style={{ margin: "4px 0 0" }}>
              A spread counts for the team they took; a total counts for both teams&apos; conferences.
            </p>
            <SplitTable
              rows={p.conferences.map((c) => (p.kings.includes(c.label) ? { ...c, label: `👑 ${c.label}` } : c))}
              shareLabel="Of picks"
            />
            <div className="divider" />
            <VsRow leftLabel="Conference games" left={p.confGame.conf} rightLabel="Non-conference" right={p.confGame.nonConf} />
          </div>

          <div className="card">
            <div className="matchup">🎯 Teams</div>
            <p className="subtext" style={{ margin: "4px 0 0" }}>Most-picked teams: spreads (ATS record) and dog picks.</p>
            <table className="stat-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Picks</th>
                  <th>ATS</th>
                  <th>Dog</th>
                </tr>
              </thead>
              <tbody>
                {p.teams.map((t) => (
                  <tr key={t.team}>
                    <td style={{ fontFamily: "inherit" }}>{t.team}</td>
                    <td>{t.picks}</td>
                    <td>{t.ats.n ? recText(t.ats) : "—"}</td>
                    <td>{t.dogPicks ? `${t.dogWins}/${t.dogPicks}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(spirit || p.bestTeam || p.nemesis || p.fades.length > 0 || myKiss.length > 0 || myMidas.length > 0) && <div className="divider" />}
            {spirit && (
              <p className="player-note">
                {logoFor(spirit.logo) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoFor(spirit.logo)!} alt="" className="spirit-logo" />
                )}
                Spirit animal: <strong>{spirit.team}</strong> &mdash; {spirit.picks} picks, the logo next to their name
              </p>
            )}
            {p.bestTeam && (
              <p className="player-note">
                💚 Best team: <strong>{p.bestTeam.team}</strong> &mdash; {recText(p.bestTeam.ats)} ATS
              </p>
            )}
            {p.nemesis && (
              <p className="player-note">
                💀 Nemesis: <strong>{p.nemesis.team}</strong> &mdash; {recText(p.nemesis.ats)} ATS
              </p>
            )}
            {myKiss.map((k) => (
              <p key={`kiss${k.team}`} className="player-note">
                💋 Kiss of death: <strong>{k.team}</strong> &mdash; {k.w}-{k.l} ATS when {p.name} takes them
              </p>
            ))}
            {myMidas.map((k) => (
              <p key={`midas${k.team}`} className="player-note">
                ✨ Midas touch: <strong>{k.team}</strong> &mdash; {k.w}-{k.l} ATS when {p.name} takes them
              </p>
            ))}
            {p.fades.length > 0 && (
              <p className="player-note">
                🙅 Fades most: {p.fades.map((f) => `${f.team} (${f.count}x)`).join(", ")}
              </p>
            )}
          </div>

          <div className="card">
            <div className="matchup">📅 When</div>
            <p className="split-title" style={{ marginTop: "8px" }}>Kickoff day</p>
            <SplitTable rows={p.days} />
            <div className="divider" />
            <p className="split-title">Kickoff time (Central)</p>
            <SplitTable rows={p.windows} />
          </div>

          <div className="card">
            <div className="matchup">🔒 Locking habits</div>
            {p.avgHoursBefore != null && (
              <p className="subtext" style={{ margin: "4px 0 0" }}>
                Locks an average of {hoursText(p.avgHoursBefore)} before kickoff.
              </p>
            )}
            <SplitTable rows={p.lockTiming} />
            <div className="divider" />
            <VsRow leftLabel="First instinct" left={p.firstInstinct} rightLabel="Changed mind" right={p.changedMind} />
          </div>

          <div className="card">
            <div className="matchup">👥 Vs. the cave</div>
            <p className="subtext" style={{ margin: "4px 0 6px" }}>
              Compared with everyone else&apos;s locked pick on the same game.
            </p>
            <Line label="🐑 With the crowd">
              <RecSpan r={p.crowd.withCrowd} />
            </Line>
            <Line label="🐺 Against the crowd">
              <RecSpan r={p.crowd.against} />
            </Line>
            <Line label="🏝️ On an island (nobody else picked it)">
              <RecSpan r={p.crowd.solo} />
            </Line>
            <Line label="🤖 With Yahngo">
              <RecSpan r={p.yahngo.with} />
            </Line>
            <Line label="🙅 Against Yahngo">
              <RecSpan r={p.yahngo.against} />
            </Line>
            {p.mates.length > 0 && (
              <>
                <p className="split-title" style={{ marginTop: "12px" }}>Picks most like&hellip;</p>
                <p className="meta" style={{ margin: "0 0 4px" }}>Same side on games you both picked.</p>
                {p.mates.map((m, i) => (
                  <div key={m.name} className="row-between" style={{ fontSize: "13px", padding: "3px 0" }}>
                    <span>
                      <SpiritLogo name={m.name} />
                      <a href={`/players/${playerSlug(m.name)}`} className="player-link">{m.name}</a>
                      {i === 0 && <span className="meta"> &middot; twin</span>}
                      {i === p.mates.length - 1 && p.mates.length > 1 && <span className="meta"> &middot; opposite</span>}
                    </span>
                    <span className="mono meta">
                      {m.same}/{m.shared} ({m.pct.toFixed(0)}%)
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="card">
            <div className="matchup">⚔️ Rivalries</div>
            <p className="subtext" style={{ margin: "4px 0 6px" }}>
              Head-to-head when they took the opposite side of someone on the same game.
            </p>
            {rivals.length === 0 ? (
              <p className="meta" style={{ margin: 0 }}>No head-to-heads yet.</p>
            ) : (
              rivals.map((r) => (
                <div key={r.opp} className="row-between" style={{ fontSize: "13px", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                  <span>
                    vs <PlayerLink name={r.opp} />
                    <span className="meta">
                      {" \u00b7 "}
                      {r.w > r.l ? "owns them" : r.w < r.l ? "owned" : "dead even"}
                    </span>
                  </span>
                  <span className={`mono ${r.w > r.l ? "pick-win" : r.w < r.l ? "pick-loss" : ""}`}>
                    {r.w}-{r.l}
                    {r.t ? `-${r.t}` : ""}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <div className="matchup">😭 Bad beats &amp; 🍀 lucky covers</div>
            <p className="subtext" style={{ margin: "4px 0 6px" }}>Picks decided by a point or less.</p>
            <div className="row-between" style={{ fontSize: "13px", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
              <span>😭 Bad beats (lost by &le;1)</span>
              <strong className="mono pick-loss">{myBeats.bad.length}</strong>
            </div>
            <div className="row-between" style={{ fontSize: "13px", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
              <span>🍀 Lucky covers (won by &le;1)</span>
              <strong className="mono pick-win">{myBeats.lucky.length}</strong>
            </div>
            {[...myBeats.bad.slice(0, 3).map((b) => ({ b, lucky: false })), ...myBeats.lucky.slice(0, 2).map((b) => ({ b, lucky: true }))].map(
              ({ b, lucky }, i) => (
                <p key={i} className="meta" style={{ margin: "6px 0 0", lineHeight: 1.45 }}>
                  {lucky ? "🍀" : "😭"} Wk {b.week}: {b.pick} &mdash; {lucky ? "covered" : "missed"} by {pts(Math.abs(b.margin))}
                  {b.score && ` (${b.score})`}
                </p>
              )
            )}
          </div>

          <div className="card">
            <div className="matchup">🔪 Sharpness</div>
            {p.clv.avg != null ? (
              <>
                <Line label="Avg closing line value">
                  <span className={`mono ${p.clv.avg > 0 ? "pick-win" : p.clv.avg < 0 ? "pick-loss" : ""}`}>
                    {p.clv.avg > 0 ? "+" : p.clv.avg < 0 ? "−" : ""}
                    {Math.abs(p.clv.avg).toFixed(2)} pts
                  </span>
                </Line>
                <Line label="Beat the closing line">
                  <span className="mono">
                    {p.clv.beatPct!.toFixed(0)}% of {p.clv.sample}
                  </span>
                </Line>
              </>
            ) : (
              <p className="meta">No closing lines yet.</p>
            )}
            <p className="meta" style={{ margin: "8px 0 0" }}>
              + means they locked a better number than where the line closed &mdash; the classic sign of a sharp.
            </p>
          </div>
        </>
      )}

      <div className="card card-accent-dog">
        <div className="matchup">🐕 Dog picks</div>
        <Line label="Record">
          <span className="mono">
            {p.dog.wins}-{p.dog.losses} &middot; {p.dog.points} pts
          </span>
        </Line>
        {p.dog.avgChased != null && (
          <Line label="Average points chased">
            <span className="mono">{p.dog.avgChased.toFixed(1)}</span>
          </Line>
        )}
        {p.dog.biggest && (
          <Line label="Biggest hit">
            <span className="mono">
              {p.dog.biggest.team} +{p.dog.biggest.points} (Wk {p.dog.biggest.week})
            </span>
          </Line>
        )}
      </div>

      {p.thisWeek.length > 0 && (
        <div className="card">
          <div className="matchup">🗓️ Locked this week</div>
          {p.thisWeek.map((r) => (
            <div key={`${r.gameId}_${r.type}`} className="row-between" style={{ fontSize: "13px", padding: "4px 0" }}>
              <span>
                {pickLabel(r)}
              </span>
              <span className={`mono ${r.graded ? (r.push ? "pick-push" : r.win ? "pick-win" : "pick-loss") : "meta"}`}>
                {r.graded ? (r.push ? "push" : r.win ? "win" : "loss") : "pending"}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="meta" style={{ lineHeight: 1.5 }}>
        Locked picks only, {CURRENT_SEASON_YEAR} season. Faded rows have fewer than {MIN_SAMPLE} decided picks &mdash;
        too few to read much into.
      </p>
    </main>
  );
}
