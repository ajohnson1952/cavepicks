import { CURRENT_SEASON_YEAR } from "@/lib/careerStats";
import { formBoard, loadSeason } from "@/lib/playerStats";
import { FormBadge, RecSpan, Sparkline, recText } from "./parts";

export const metadata = { title: "Players" };
export const dynamic = "force-dynamic";

// Everyone in the cave, hottest first - each row opens that player's page.
export default async function PlayersPage() {
  const data = await loadSeason(CURRENT_SEASON_YEAR);
  const board = formBoard(data);

  return (
    <main className="wide">
      <h1>Players</h1>
      <p className="subtext">Tap anyone for their splits, trends and tendencies. Sorted by the last 3 weeks.</p>
      <div className="card">
        {board.length === 0 && <p className="meta">No graded picks yet this season.</p>}
        {board.map((p, i) => (
          <a
            key={p.name}
            href={`/players/${p.slug}`}
            className="player-row"
            style={{ borderBottom: i === board.length - 1 ? "none" : undefined }}
          >
            <span style={{ minWidth: 0 }}>
              <strong>{p.name}</strong> <FormBadge status={p.form.status} seasonPct={p.form.season.pct} />
              <span className="meta" style={{ display: "block", marginTop: "2px" }}>
                Season {recText(p.form.season)}
                {p.form.season.pct != null && ` (${p.form.season.pct.toFixed(0)}%)`}
                {p.kings.length > 0 && ` \u00b7 👑 ${p.kings.join(", ")}`}
                {p.form.streak && p.form.streak.count >= 3 && ` · ${p.form.streak.count}${p.form.streak.kind} streak${p.form.streak.kind === "W" ? " 🚬" : ""}`}
              </span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
              <Sparkline series={p.form.series} />
              <span style={{ textAlign: "right", minWidth: "64px" }}>
                <span className="meta" style={{ display: "block", fontSize: "10px" }}>LAST 3 WKS</span>
                <RecSpan r={p.form.last3} />
              </span>
              <span className="meta" aria-hidden="true">›</span>
            </span>
          </a>
        ))}
      </div>
      <p className="meta" style={{ lineHeight: 1.5 }}>
        Side picks only (spreads + totals). 🚬 / 🧊 = the last 3 finished weeks are well above or below that
        player&apos;s season rate. {CURRENT_SEASON_YEAR} season.
      </p>
    </main>
  );
}
