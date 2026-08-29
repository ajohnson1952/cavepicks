import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

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
    <main style={{ maxWidth: 900 }}>
      <h1>Everyone&apos;s Picks &mdash; Week {week.weekNumber}</h1>
      <p style={{ fontSize: "0.85em", color: "#666" }}>
        Anyone with the site link can see this page &mdash; it&apos;s the shared board, not a private pick sheet.
      </p>

      {users.map((u) => {
        const userPicks = picksByUser.get(u.id) ?? [];
        const sidePicks = userPicks.filter((p) => p.pickType !== "DOG");
        const dogPick = userPicks.find((p) => p.pickType === "DOG");
        const lockedSideCount = sidePicks.filter((p) => p.locked).length;

        return (
          <div key={u.id} style={{ border: "1px solid #ddd", padding: "0.75rem", marginBottom: "0.75rem" }}>
            <strong>{u.name}</strong>
            <span style={{ color: "#666", fontSize: "0.85em" }}>
              {" "}
              &middot; {lockedSideCount}/5 locked &middot; dog{" "}
              {dogPick ? (dogPick.locked ? "locked" : "picked, not locked") : "not picked"}
            </span>
            <ul style={{ marginTop: "0.4rem", marginBottom: 0 }}>
              {sidePicks.length === 0 && <li style={{ color: "#999" }}>No side picks yet</li>}
              {sidePicks.map((p) => (
                <li key={p.id}>
                  {p.pickType === "SPREAD" ? "Spread" : "Total"}: {p.game.awayTeam} @ {p.game.homeTeam} &mdash;{" "}
                  {p.selection}
                  {p.locked ? ` 🔒 (${p.lockedLine ?? "?"})` : " (not locked)"}
                </li>
              ))}
              {dogPick && (
                <li>
                  Dog: {dogPick.game.awayTeam} @ {dogPick.game.homeTeam} &mdash; {dogPick.selection}
                  {dogPick.locked
                    ? ` 🔒 (worth ${dogPick.dogSpreadValue ?? "?"} pts if it hits)`
                    : " (not locked)"}
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </main>
  );
}
