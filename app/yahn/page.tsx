import { getWeekNumberForDate } from "@/lib/currentWeek";
import { getYahnFeed, unitsAt110, YAHN_SITE } from "@/lib/yahn";
import { getCaveSplits } from "@/lib/caveSplits";
import { GHOST_NAME } from "@/lib/ghost";

// Helper page: this week's picks from the-yahngorithm (the owner's model
// site), biggest edge first, plus "Cave vs. Yahngo" - games where the league's
// locked picks lean the opposite way from the model. Reads that site's feed
// (lib/yahn.ts) and our own cached lock counts (lib/caveSplits.ts, counts
// only). Nothing here affects anyone's picks.
export const metadata = { title: "Yahngo's Picks" };
export const dynamic = "force-dynamic";

const WHY: Record<string, string> = {
  srs: "2nd model agrees",
  revenge: "revenge spot",
  travel: "travel spot",
  lookahead: "lookahead spot",
  letdown: "letdown spot",
  wind: "wind",
  slow_pace: "slow pace",
  fast_pace: "fast pace",
};

const kickoff = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

export default async function YahnPage() {
  const weekNumber = getWeekNumberForDate();
  const feed = await getYahnFeed(weekNumber);

  const rows = (feed?.games ?? [])
    .flatMap((g) => g.picks.map((p) => ({ g, p })))
    .sort((a, b) => b.p.edge - a.p.edge);

  // Cave vs. Yahngo: locked picks on the model's side vs the other side of the
  // same market. Counts only, and only what's already locked.
  const splits = feed ? await getCaveSplits(weekNumber).catch(() => null) : null;
  const showdowns = rows
    .map(({ g, p }) => {
      const s = splits?.games.find((x) => g.home.oddsNames.includes(x.home) && g.away.oddsNames.includes(x.away));
      if (!s) return null;
      const [withIt, against] =
        p.side === "home" ? [s.spread.home, s.spread.away]
        : p.side === "away" ? [s.spread.away, s.spread.home]
        : p.side === "over" ? [s.total.over, s.total.under]
        : [s.total.under, s.total.over];
      return { g, p, withIt, against };
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.withIt + x.against > 0)
    .sort((a, b) => b.against - b.withIt - (a.against - a.withIt));
  const fades = showdowns.filter((x) => x.against > x.withIt);
  const agrees = showdowns.filter((x) => x.withIt > x.against);

  const rec = feed?.record;
  const units = rec ? unitsAt110(rec.win, rec.loss) : null;

  return (
    <main>
      <h1>
        <img
          src="/yahn-joe.png"
          alt=""
          width={28}
          height={28}
          style={{ borderRadius: "50%", verticalAlign: "-6px", marginRight: "8px" }}
        />
        {GHOST_NAME}&apos;s Picks
      </h1>
      <p className="subtext">
        Week {weekNumber} picks from{" "}
        <a href={YAHN_SITE} target="_blank" rel="noreferrer" style={{ color: "var(--action-soft)" }}>
          the yahngorithm
        </a>
        , a model that compares its own numbers to the betting line. A pick shows up when the model
        disagrees with the line by enough points and a second signal backs it up. Biggest edge first.
      </p>

      {rec && (
        <div className="card">
          <div className="row-between">
            <span className="meta">Model&apos;s season record</span>
            <strong className="mono">
              {rec.win}-{rec.loss}
              {rec.push ? `-${rec.push}` : ""}
              {units != null && (
                <span className={units >= 0 ? "pick-win" : "pick-loss"} style={{ marginLeft: "10px" }}>
                  {units >= 0 ? "+" : "−"}
                  {Math.abs(units).toFixed(2)}u
                </span>
              )}
            </strong>
          </div>
          <p className="meta" style={{ margin: "6px 0 0" }}>
            It&apos;s roughly a coin flip so far. Treat this as a second opinion, not an answer key.
          </p>
        </div>
      )}

      {showdowns.length > 0 && (
        <div className="card">
          <div className="matchup">⚔️ Cave vs. {GHOST_NAME}</div>
          <p className="subtext" style={{ margin: "4px 0 8px" }}>
            Where the cave&apos;s locked picks line up against the model &mdash; or with it. Locked picks only.
          </p>
          {[...fades, ...agrees].map(({ g, p, withIt, against }) => {
            const fading = against > withIt;
            return (
              <div key={`${g.id}_${p.market}`} className="row-between" style={{ fontSize: "13px", marginBottom: "5px" }}>
                <span>
                  {fading ? "⚔️" : "🤝"} {g.away.abbr ?? g.away.name} @ {g.home.abbr ?? g.home.name}
                  <span className="meta"> &middot; model: {p.label}</span>
                </span>
                <span className="mono" style={{ color: fading ? "var(--down)" : "var(--up)" }}>
                  {fading ? `${against} against, ${withIt} with` : `${withIt} with, ${against} against`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!feed ? (
        <p className="subtext">Couldn&apos;t reach the yahngorithm right now. Try again in a bit.</p>
      ) : rows.length === 0 ? (
        <p className="subtext">No model picks for this week yet. They post once this week&apos;s ratings are in.</p>
      ) : (
        <div className="card">
          <table className="stat-table" style={{ marginTop: 0 }}>
            <thead>
              <tr>
                <th>Game</th>
                <th>Pick</th>
                <th>Edge</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ g, p }) => (
                <tr key={`${g.id}_${p.market}`}>
                  <td>
                    <a href={g.url} target="_blank" rel="noreferrer" style={{ color: "var(--ink)", textDecoration: "none" }}>
                      {g.away.abbr ?? g.away.name} @ {g.home.abbr ?? g.home.name}
                    </a>
                    <div className="meta">{kickoff(g.kickoff)}</div>
                  </td>
                  <td>
                    <span
                      className={p.result === "win" ? "pick-win" : p.result === "loss" ? "pick-loss" : undefined}
                      style={{ fontWeight: 700, color: p.result ? undefined : "var(--ink)" }}
                    >
                      {p.label}
                      {p.result ? ` ${p.result === "win" ? "✓" : p.result === "loss" ? "✗" : "push"}` : ""}
                    </span>
                    {p.why.length > 0 && (
                      <div className="meta">{p.why.map((w) => WHY[w] ?? w).join(", ")}</div>
                    )}
                  </td>
                  <td style={{ color: "var(--up)" }}>+{p.edge}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="meta" style={{ margin: "10px 0 0" }}>
            Edge = how many points the model disagrees with the line by. Tap a game to open it on the
            yahngorithm. On your pick sheet, those games get an amber pill showing the line the model
            projects (for example &ldquo;TENN -18.9&rdquo;) instead of the grey &ldquo;Model&rdquo; link. {GHOST_NAME} on the
            Standings plays the five biggest of these each week.
          </p>
        </div>
      )}
    </main>
  );
}
