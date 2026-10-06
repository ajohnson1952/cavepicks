import { getWeekNumberForDate } from "@/lib/currentWeek";
import { getYahnFeed, unitsAt110, YAHN_SITE } from "@/lib/yahn";

// Helper page: this week's picks from the-yahngorithm (the owner's model
// site), biggest edge first. Reads only that site's feed (lib/yahn.ts) -
// never this app's database - and nothing here affects anyone's picks.
export const metadata = { title: "Yahn's Picks" };
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
        Yahn&apos;s Picks
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
            yahngorithm. On your pick sheet, Joe&apos;s face marks the side the model took.
          </p>
        </div>
      )}
    </main>
  );
}
