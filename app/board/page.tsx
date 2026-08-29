import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function abbr(selection: string, homeTeam: string, homeAbbr: string | null, awayTeam: string, awayAbbr: string | null) {
  if (selection === homeTeam) return homeAbbr ?? selection;
  if (selection === awayTeam) return awayAbbr ?? selection;
  return selection;
}

export default async function BoardPage() {
  const week = await prisma.week.findUnique({
    where: { seasonYear_weekNumber: { seasonYear: 2026, weekNumber: 1 } },
  });

  if (!week) {
    return (
      <main>
        <h1>No active week yet</h1>
      </main>
    );
  }

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const picks = await prisma.pick.findMany({
    where: { weekId: week.id },
    include: { game: true },
    orderBy: { game: { commenceTime: "asc" } },
  });

  const picksByUser = new Map<string, typeof picks>();
  for (const p of picks) {
    const list = picksByUser.get(p.userId) ?? [];
    list.push(p);
    picksByUser.set(p.userId, list);
  }

  return (
    <main>
      <h1>The board</h1>
      <p className="subtext">Week {week.weekNumber} &middot; everyone&apos;s picks, live. &middot; <a href="/standings">Standings</a></p>

      {users.map((u) => {
        const userPicks = picksByUser.get(u.id) ?? [];
        const sidePicks = userPicks.filter((p) => p.pickType !== "DOG");
        const dogPick = userPicks.find((p) => p.pickType === "DOG");
        const lockedSideCount = sidePicks.filter((p) => p.locked).length;

        return (
          <div key={u.id} className="card">
            <div className="row-between">
              <div className="matchup">{u.name}</div>
              <div className="meta">
                {lockedSideCount}/5 locked &middot; dog{" "}
                {dogPick ? (dogPick.locked ? "locked" : "picked") : "\u2014"}
              </div>
            </div>
            <div className="divider" />
            {sidePicks.length === 0 && <p className="subtext" style={{ margin: 0 }}>No side picks yet</p>}
            {sidePicks.map((p) => {
              const matchupAbbr = `${p.game.awayAbbr ?? p.game.awayTeam} @ ${p.game.homeAbbr ?? p.game.homeTeam}`;
              const pickLabel =
                p.pickType === "SPREAD"
                  ? abbr(p.selection, p.game.homeTeam, p.game.homeAbbr, p.game.awayTeam, p.game.awayAbbr)
                  : p.selection;
              return (
                <div key={p.id} style={{ fontSize: "13px", marginBottom: "4px" }}>
                  <span className="mono" style={{ color: "var(--dim)" }}>
                    {p.pickType === "SPREAD" ? "SPRD" : "TOTL"}
                  </span>{" "}
                  {matchupAbbr} &mdash; {pickLabel}
                  {p.locked ? (
                    <span className="locked-badge" style={{ marginLeft: "6px" }}>
                      <span className="locked-dot" />
                      <span className="locked-text mono">{p.lockedLine ?? "?"}</span>
                    </span>
                  ) : (
                    <span className="meta"> (open)</span>
                  )}
                </div>
              );
            })}
            {dogPick && (
              <div style={{ fontSize: "13px", marginTop: "6px" }}>
                <span className="mono" style={{ color: "var(--dim)" }}>DOG</span>{" "}
                {dogPick.game.awayAbbr ?? dogPick.game.awayTeam} @ {dogPick.game.homeAbbr ?? dogPick.game.homeTeam}
                {" \u2014 "}
                {abbr(dogPick.selection, dogPick.game.homeTeam, dogPick.game.homeAbbr, dogPick.game.awayTeam, dogPick.game.awayAbbr)}
                {dogPick.locked ? (
                  <span className="locked-badge" style={{ marginLeft: "6px" }}>
                    <span className="locked-dot" />
                    <span className="locked-text mono">{dogPick.dogSpreadValue ?? "?"} pts</span>
                  </span>
                ) : (
                  <span className="meta"> (open)</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </main>
  );
}
