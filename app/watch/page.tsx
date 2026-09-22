import { formatSpread } from "@/lib/format";
import { isDecided, PickOutcome } from "@/lib/weeklyRace";
import { computeWatchData, Rel } from "@/lib/watchData";
import RefreshButton from "./RefreshButton";

export const dynamic = "force-dynamic";

const CT = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  d.toLocaleString("en-US", { timeZone: "America/Chicago", ...opts });

function abbrOf(selection: string, g: { homeTeam: string; homeAbbr: string | null; awayTeam: string; awayAbbr: string | null }) {
  if (selection === g.homeTeam) return g.homeAbbr ?? selection;
  if (selection === g.awayTeam) return g.awayAbbr ?? selection;
  return selection;
}

const OUTCOME_UI: Record<PickOutcome, { label: string; cls: string }> = {
  won: { label: "won", cls: "pick-win" },
  lost: { label: "lost", cls: "pick-loss" },
  push: { label: "push", cls: "pick-push" },
  "live-covering": { label: "covering", cls: "pick-win" },
  "live-losing": { label: "trailing", cls: "pick-loss" },
  pending: { label: "not started", cls: "pick-push" },
  missed: { label: "not locked", cls: "pick-loss" },
  unknown: { label: "?", cls: "pick-push" },
};

export default async function WatchPage() {
  const {
    week,
    games,
    pickedGames,
    statusOf,
    gameById,
    lineFor,
    outcome,
    race,
    aliveIds,
    blurb,
    picksByGame,
    relevanceOf,
  } = await computeWatchData();

  const relRank: Record<Rel, number> = { swing: 0, watch: 1, dog: 2, cold: 3 };

  // Everything not final, in the order you'd actually watch it: kickoff time
  // first, relevance as the tiebreak when several kick at once.
  const upcoming = pickedGames
    .filter((g) => statusOf.get(g.id)!.phase !== "final")
    .sort(
      (a, b) =>
        a.commenceTime.getTime() - b.commenceTime.getTime() ||
        relRank[relevanceOf(a)] - relRank[relevanceOf(b)]
    );
  const doneGames = pickedGames
    .filter((g) => statusOf.get(g.id)!.phase === "final")
    .sort((a, b) => a.commenceTime.getTime() - b.commenceTime.getTime());

  // group the upcoming list by calendar day (Central) so it reads as a schedule
  const dayLabel = (d: Date) => CT(d, { weekday: "long", month: "short", day: "numeric" });
  const dayGroups: { day: string; games: (typeof games)[number][] }[] = [];
  for (const g of upcoming) {
    const day = dayLabel(g.commenceTime);
    if (dayGroups[dayGroups.length - 1]?.day !== day) dayGroups.push({ day, games: [] });
    dayGroups[dayGroups.length - 1].games.push(g);
  }

  const asOf = CT(new Date(), { hour: "numeric", minute: "2-digit", second: "2-digit" }) + " CT";

  function GameRow({ g, rel, dim }: { g: (typeof games)[number]; rel: Rel | "done"; dim?: boolean }) {
    const st = statusOf.get(g.id)!;
    const gp = (picksByGame.get(g.id) ?? []).slice().sort((a, b) => a.user.name.localeCompare(b.user.name));
    const away = g.awayAbbr ?? g.awayTeam;
    const home = g.homeAbbr ?? g.homeTeam;

    let statusLine: string;
    if (st.phase === "final") {
      statusLine = `Final · ${away} ${st.awayScore}, ${home} ${st.homeScore}`;
    } else if (st.phase === "live") {
      statusLine =
        (st.detail ? `${st.detail} · ` : "Live · ") +
        (st.homeScore != null ? `${away} ${st.awayScore}, ${home} ${st.homeScore}` : "");
    } else {
      statusLine =
        CT(g.commenceTime, { weekday: "short", hour: "numeric", minute: "2-digit" }) +
        " CT" +
        (st.broadcast ? ` · ${st.broadcast}` : "");
    }

    return (
      <div className="card" style={dim ? { opacity: 0.6 } : undefined}>
        <div className="matchup">
          {away} @ {home}
          {rel === "swing" && (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing: "0.05em",
                color: "var(--action-soft)",
                border: "1px solid var(--action)",
                borderRadius: "4px",
                padding: "1px 5px",
                marginLeft: "8px",
                verticalAlign: "1px",
              }}
            >
              SWING
            </span>
          )}
        </div>
        <div className="meta" style={{ marginTop: "2px" }}>
          {statusLine}
        </div>
        <div className="divider" />
        {gp.map((p) => {
          const g2 = gameById.get(p.gameId)!;
          const o = outcome.get(p.id)!;
          const ui = OUTCOME_UI[o];
          const alive = aliveIds.has(p.userId);
          const { line } = lineFor(p);
          let label: string;
          if (p.pickType === "SPREAD") {
            label = `${abbrOf(p.selection, g2)}${line != null ? ` ${formatSpread(line)}` : ""}`;
          } else if (p.pickType === "TOTAL") {
            label = line != null ? `${p.selection === "over" ? "o" : "u"}${line}` : p.selection;
          } else {
            label = `${abbrOf(p.selection, g2)} ML`;
          }
          const showTag = isDecided(o) || o === "live-covering" || o === "live-losing" || o === "missed";
          return (
            <div key={p.id} style={{ fontSize: "13px", marginBottom: "3px" }}>
              <span style={{ fontWeight: alive ? 700 : 400, color: alive ? "var(--ink)" : "var(--dim)" }}>
                {p.user.name}
              </span>
              {!alive && o !== "missed" && <span className="meta"> (out)</span>}
              {p.pickType === "DOG" && <span className="meta"> · dog</span>}
              {"  "}
              {label}{" "}
              <span className={ui.cls} style={{ fontSize: "11px", fontWeight: 700 }}>
                {showTag ? ui.label : ""}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  const DayHeader = ({ day }: { day: string }) => (
    <h3
      style={{
        fontSize: "12px",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--dim)",
        margin: "16px 0 6px",
      }}
    >
      {day}
    </h3>
  );

  return (
    <main>
      <h1>Watch &mdash; Week {week.weekNumber}</h1>
      <RefreshButton asOf={asOf} />

      <div className="card" style={{ borderColor: "var(--action)" }}>
        <p style={{ margin: 0, lineHeight: 1.5 }}>{blurb}</p>
      </div>

      <section style={{ marginTop: "16px" }}>
        <h2 style={{ fontSize: "15px", marginBottom: "6px" }}>Standings this week</h2>
        {race
          .filter((r) => r.totalPicks > 0)
          .map((r) => (
            <div key={r.userId} className="row-between" style={{ fontSize: "13px", padding: "3px 0" }}>
              <span style={{ fontWeight: r.alive ? 700 : 400, color: r.alive ? "var(--ink)" : "var(--dim)" }}>
                {r.name}
                {r.clinched ? " · clinched" : r.alive ? "" : " · out"}
              </span>
              <span className="mono" style={{ color: "var(--dim)" }}>
                {r.banked}/{r.totalPicks} correct · can reach {r.ceiling}
              </span>
            </div>
          ))}
      </section>

      <section style={{ marginTop: "20px" }}>
        <h2 style={{ fontSize: "15px", marginBottom: "2px" }}>The slate</h2>
        <p className="subtext" style={{ margin: "0 0 4px" }}>
          In kickoff order. <strong style={{ color: "var(--action-soft)" }}>SWING</strong> = two or more
          players still alive have a pick. Dimmed = knocked-out players only.
        </p>
        {dayGroups.map((grp) => (
          <div key={grp.day}>
            <DayHeader day={grp.day} />
            {grp.games.map((g) => {
              const rel = relevanceOf(g);
              return <GameRow key={g.id} g={g} rel={rel} dim={rel === "cold"} />;
            })}
          </div>
        ))}
        {upcoming.length === 0 && pickedGames.length > 0 && (
          <p className="subtext">Every picked game is final — see below.</p>
        )}
      </section>

      {doneGames.length > 0 && (
        <section style={{ marginTop: "22px" }}>
          <h2 style={{ fontSize: "15px", marginBottom: "6px" }}>Final</h2>
          {doneGames.map((g) => (
            <GameRow key={g.id} g={g} rel="done" dim />
          ))}
        </section>
      )}

      {pickedGames.length === 0 && <p className="subtext">No picks are in for this week yet.</p>}
    </main>
  );
}
