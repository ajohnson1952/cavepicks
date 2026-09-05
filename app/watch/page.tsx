import { prisma } from "@/lib/db";
import { getOrCreateCurrentWeek } from "@/lib/currentWeek";
import { fetchEspnScoreboard, teamNamesMatch, toYyyymmdd } from "@/lib/espnScores";
import { gradePick } from "@/lib/scoring";
import { latestPreKickoffSnapshot } from "@/lib/lock";
import { formatSpread } from "@/lib/format";
import { computeRace, buildRaceBlurb, isDecided, PickOutcome } from "@/lib/weeklyRace";
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
  unknown: { label: "?", cls: "pick-push" },
};

export default async function WatchPage() {
  const week = await getOrCreateCurrentWeek();
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const games = await prisma.game.findMany({
    where: { weekId: week.id },
    include: { oddsSnapshots: { orderBy: { capturedAt: "desc" }, take: 10 } },
    orderBy: { commenceTime: "asc" },
  });
  const picks = await prisma.pick.findMany({ where: { weekId: week.id }, include: { user: true } });

  const pickedGames = games.filter((g) => !g.voided && picks.some((p) => p.gameId === g.id));

  // Live scores: one ESPN pull per distinct date a picked game falls on.
  const dates = Array.from(new Set(pickedGames.map((g) => toYyyymmdd(g.commenceTime))));
  const espn = (await Promise.all(dates.map((d) => fetchEspnScoreboard(d)))).flat();
  const espnFor = (g: (typeof games)[number]) =>
    espn.find((r) => teamNamesMatch(g.homeTeam, r.homeTeam) && teamNamesMatch(g.awayTeam, r.awayTeam)) ?? null;

  type Status = {
    phase: "pre" | "live" | "final";
    homeScore: number | null;
    awayScore: number | null;
    detail: string | null;
    broadcast: string | null;
  };
  const statusOf = new Map<string, Status>();
  for (const g of pickedGames) {
    const e = espnFor(g);
    const final = g.isFinal || e?.completed === true;
    const live = !final && e?.state === "in";
    const phase: Status["phase"] = final ? "final" : live ? "live" : "pre";
    statusOf.set(g.id, {
      phase,
      // ESPN reports 0-0 (not null) before kickoff - only trust a score once
      // the game is actually live or final, or a not-yet-started game reads
      // as "currently 0-0" and every under looks like it's covering.
      homeScore: g.isFinal ? g.homeScore : phase === "pre" ? null : e?.homeScore ?? null,
      awayScore: g.isFinal ? g.awayScore : phase === "pre" ? null : e?.awayScore ?? null,
      detail: e?.statusDetail ?? null,
      broadcast: g.broadcast ?? e?.broadcast ?? null,
    });
  }

  const gameById = new Map(games.map((g) => [g.id, g]));

  function lineFor(pick: (typeof picks)[number], g: (typeof games)[number]) {
    if (pick.locked) return { line: pick.lockedLine, dogVal: pick.dogSpreadValue };
    const snap = latestPreKickoffSnapshot(g.oddsSnapshots, g.commenceTime);
    if (!snap) return { line: null as number | null, dogVal: null as number | null };
    const isHome = pick.selection === g.homeTeam;
    if (pick.pickType === "SPREAD") return { line: isHome ? snap.spreadHome : snap.spreadAway, dogVal: null };
    if (pick.pickType === "TOTAL") return { line: snap.total, dogVal: null };
    return { line: null, dogVal: Math.abs((isHome ? snap.spreadHome : snap.spreadAway) ?? 0) };
  }

  function outcomeOf(pick: (typeof picks)[number]): PickOutcome {
    const st = statusOf.get(pick.gameId);
    const g = gameById.get(pick.gameId);
    if (!st || !g) return "unknown";

    if (pick.graded) {
      if (pick.pickType === "DOG") return pick.isWin ? "won" : "lost";
      return pick.isPush ? "push" : pick.isWin ? "won" : "lost";
    }
    if (st.phase === "pre" || st.homeScore == null || st.awayScore == null) return "pending";

    const { line, dogVal } = lineFor(pick, g);
    if (pick.pickType !== "DOG" && line == null) return "unknown";

    const r = gradePick(
      { homeTeam: g.homeTeam, awayTeam: g.awayTeam, homeScore: st.homeScore, awayScore: st.awayScore },
      { pickType: pick.pickType, selection: pick.selection, lockedLine: line, dogSpreadValue: dogVal }
    );
    if (st.phase === "final") {
      if (pick.pickType === "DOG") return r.isWin ? "won" : "lost";
      return r.isPush ? "push" : r.isWin ? "won" : "lost";
    }
    if (pick.pickType === "DOG") return r.isWin ? "live-covering" : "live-losing";
    return r.isPush ? "pending" : r.isWin ? "live-covering" : "live-losing";
  }

  const outcome = new Map(picks.map((p) => [p.id, outcomeOf(p)]));

  // --- weekly race (SPREAD + TOTAL only) ---
  const sidePicks = picks.filter((p) => p.pickType !== "DOG");
  const byUser = new Map<string, PickOutcome[]>();
  for (const p of sidePicks) {
    const arr = byUser.get(p.userId) ?? [];
    arr.push(outcome.get(p.id)!);
    byUser.set(p.userId, arr);
  }
  const race = computeRace(users.map((u) => ({ userId: u.id, name: u.name })), byUser);
  const aliveIds = new Set(race.filter((r) => r.alive).map((r) => r.userId));

  const sideGameIds = new Set(sidePicks.map((p) => p.gameId));
  const sideGames = pickedGames.filter((g) => sideGameIds.has(g.id));
  const decidedSideGames = sideGames.filter((g) => statusOf.get(g.id)?.phase === "final").length;
  const blurb = buildRaceBlurb(race, decidedSideGames, sideGames.length);

  // --- relevance of each game, for a badge + a tiebreak within a time slot ---
  const picksByGame = new Map<string, typeof picks>();
  for (const p of picks) {
    const arr = picksByGame.get(p.gameId) ?? [];
    arr.push(p);
    picksByGame.set(p.gameId, arr);
  }

  type Rel = "swing" | "watch" | "dog" | "cold";
  const relevanceOf = (g: (typeof games)[number]): Rel => {
    const gp = picksByGame.get(g.id) ?? [];
    const aliveSidePickers = new Set(
      gp.filter((p) => p.pickType !== "DOG" && aliveIds.has(p.userId)).map((p) => p.userId)
    );
    if (aliveSidePickers.size >= 2) return "swing";
    if (aliveSidePickers.size === 1) return "watch";
    if (gp.some((p) => p.pickType === "DOG")) return "dog";
    return "cold";
  };
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
          let label: string;
          if (p.pickType === "SPREAD") {
            const { line } = lineFor(p, g2);
            label = `${abbrOf(p.selection, g2)}${line != null ? ` ${formatSpread(line)}` : ""}`;
          } else if (p.pickType === "TOTAL") {
            const { line } = lineFor(p, g2);
            label = `${p.selection === "over" ? "o" : "u"}${line ?? "?"}`;
          } else {
            label = `${abbrOf(p.selection, g2)} ML`;
          }
          return (
            <div key={p.id} style={{ fontSize: "13px", marginBottom: "3px" }}>
              <span style={{ fontWeight: alive ? 700 : 400, color: alive ? "var(--ink)" : "var(--dim)" }}>
                {p.user.name}
              </span>
              {!alive && <span className="meta"> (out)</span>}
              {p.pickType === "DOG" && <span className="meta"> · dog</span>}
              {"  "}
              {label}{" "}
              <span className={ui.cls} style={{ fontSize: "11px", fontWeight: 700 }}>
                {isDecided(o) || o === "live-covering" || o === "live-losing" ? ui.label : ""}
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
