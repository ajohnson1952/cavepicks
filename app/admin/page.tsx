import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getOrCreateCurrentWeek } from "@/lib/currentWeek";
import { adminLogin, adminLogout, voidGame, unvoidGame, setManualScore } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { week?: string; showAll?: string };
}) {
  const session = cookies().get("admin_session")?.value;
  const isAuthed = session === "authenticated";

  if (!isAuthed) {
    return (
      <main>
        <h1>Admin</h1>
        <p className="subtext">Enter the admin password to manage games.</p>
        <form action={adminLogin}>
          <input
            type="password"
            name="password"
            placeholder="Admin password"
            className="admin-input"
            style={{ width: "100%", marginBottom: "8px" }}
          />
          <button type="submit" className="btn btn-lock" style={{ width: "auto" }}>
            Log in
          </button>
        </form>
      </main>
    );
  }

  const currentWeek = await getOrCreateCurrentWeek();
  const allWeeksMeta = await prisma.week.findMany({
    where: { seasonYear: 2026 },
    orderBy: { weekNumber: "asc" },
  });
  const minWeek = allWeeksMeta[0]?.weekNumber ?? currentWeek.weekNumber;
  const maxWeek = allWeeksMeta[allWeeksMeta.length - 1]?.weekNumber ?? currentWeek.weekNumber;

  const requestedWeekNumber = searchParams.week ? Number(searchParams.week) : currentWeek.weekNumber;
  const weekNumber = Math.max(minWeek, Math.min(maxWeek, requestedWeekNumber));
  const week = allWeeksMeta.find((w) => w.weekNumber === weekNumber);

  const showAll = searchParams.showAll === "1";

  const allGames = week
    ? await prisma.game.findMany({ where: { weekId: week.id }, orderBy: { commenceTime: "asc" } })
    : [];
  const games = showAll ? allGames : allGames.filter((g) => !g.isFinal || g.voided);
  const hiddenCount = allGames.length - games.length;

  return (
    <main>
      <div className="row-between">
        <h1>Admin</h1>
        <form action={adminLogout}>
          <button type="submit" className="btn btn-ghost">
            Log out
          </button>
        </form>
      </div>
      <p className="subtext">Void postponed/cancelled games, or manually fix a score.</p>

      <div className="row-between" style={{ marginBottom: "12px" }}>
        <a href={`/admin?week=${weekNumber - 1}`} className="btn" style={{ visibility: weekNumber > minWeek ? "visible" : "hidden" }}>
          &larr; Prev
        </a>
        <strong>Week {weekNumber}</strong>
        <a href={`/admin?week=${weekNumber + 1}`} className="btn" style={{ visibility: weekNumber < maxWeek ? "visible" : "hidden" }}>
          Next &rarr;
        </a>
      </div>

      {!week && <p className="subtext">No week {weekNumber} found.</p>}

      {week && (
        <p className="subtext">
          {hiddenCount > 0 && !showAll
            ? `Showing ${games.length} game(s) needing attention (${hiddenCount} already-final games hidden). `
            : ""}
          <a href={`/admin?week=${weekNumber}${showAll ? "" : "&showAll=1"}`}>
            {showAll ? "Hide already-final games" : "Show all games"}
          </a>
        </p>
      )}

      {games.map((g) => (
        <div key={g.id} className="card">
          <div className="matchup">
            {g.awayTeam} @ {g.homeTeam}
          </div>
          <div className="meta">
            {g.commenceTime.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" })}{" "}
            CT
          </div>
          <div className="meta" style={{ marginTop: "4px" }}>
            Status:{" "}
            {g.voided
              ? `Voided \u2014 ${g.voidReason}`
              : g.isFinal
              ? `Final ${g.awayScore}\u2013${g.homeScore}`
              : "Not final"}
          </div>

          <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap", alignItems: "center" }}>
            {!g.voided ? (
              <form action={voidGame} style={{ display: "flex", gap: "6px" }}>
                <input type="hidden" name="gameId" value={g.id} />
                <input type="text" name="reason" placeholder="Reason (optional)" className="admin-input" style={{ width: "140px" }} />
                <button type="submit" className="btn">
                  Mark Postponed
                </button>
              </form>
            ) : (
              <form action={unvoidGame}>
                <input type="hidden" name="gameId" value={g.id} />
                <button type="submit" className="btn">
                  Un-void
                </button>
              </form>
            )}

            <form action={setManualScore} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <input type="hidden" name="gameId" value={g.id} />
              <input
                type="number"
                name="awayScore"
                placeholder="Away"
                defaultValue={g.awayScore ?? ""}
                className="admin-input"
                style={{ width: "60px" }}
              />
              <input
                type="number"
                name="homeScore"
                placeholder="Home"
                defaultValue={g.homeScore ?? ""}
                className="admin-input"
                style={{ width: "60px" }}
              />
              <button type="submit" className="btn btn-lock" style={{ width: "auto" }}>
                Save Score
              </button>
            </form>
          </div>
        </div>
      ))}
    </main>
  );
}
