import { prisma } from "@/lib/db";
import { isGameLocked, lockTimeFor } from "@/lib/lock";
import { submitPicks } from "./actions";
import { notFound } from "next/navigation";

export default async function PickPage({ params }: { params: { slug: string } }) {
  const user = await prisma.user.findUnique({ where: { pickSlug: params.slug } });
  if (!user) return notFound();

  const week = await prisma.week.findUnique({
    where: { seasonYear_weekNumber: { seasonYear: 2026, weekNumber: 1 } },
  });
  if (!week) {
    return (
      <main>
        <h1>No active week yet</h1>
        <p>Ask the commissioner to pull odds first.</p>
      </main>
    );
  }

  const games = await prisma.game.findMany({
    where: { weekId: week.id },
    include: { oddsSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
    orderBy: { commenceTime: "asc" },
  });

  const picks = await prisma.pick.findMany({ where: { userId: user.id, weekId: week.id } });
  const pickLookup = new Map<string, (typeof picks)[number]>();
  for (const p of picks) pickLookup.set(`${p.gameId}_${p.pickType}`, p);

  const openGames = games.filter((g) => !isGameLocked(g.commenceTime));
  const lockedGames = games.filter((g) => isGameLocked(g.commenceTime));

  const lockedSideCount = lockedGames.reduce((count, g) => {
    return (
      count +
      (["SPREAD", "TOTAL"] as const).filter((t) => pickLookup.has(`${g.id}_${t}`)).length
    );
  }, 0);
  const hasLockedDog = lockedGames.some((g) => pickLookup.has(`${g.id}_DOG`));

  const boundSubmit = submitPicks.bind(null, params.slug);

  return (
    <main style={{ maxWidth: 700 }}>
      <h1>{user.name}&apos;s Picks</h1>
      <p>
        Week {week.weekNumber} &middot; {lockedSideCount}/5 side picks locked so far &middot; dog pick{" "}
        {hasLockedDog ? "locked" : "not locked"} yet.
      </p>

      {lockedGames.length > 0 && (
        <section>
          <h2>Locked (can&apos;t change)</h2>
          {lockedGames.map((g) => {
            const spread = pickLookup.get(`${g.id}_SPREAD`);
            const total = pickLookup.get(`${g.id}_TOTAL`);
            const dog = pickLookup.get(`${g.id}_DOG`);
            return (
              <div
                key={g.id}
                style={{ opacity: 0.6, border: "1px solid #ccc", padding: "0.5rem", marginBottom: "0.5rem" }}
              >
                <strong>
                  {g.awayTeam} @ {g.homeTeam}
                </strong>
                <div>Spread pick: {spread ? spread.selection : "none"}</div>
                <div>Total pick: {total ? total.selection : "none"}</div>
                <div>Dog pick: {dog ? dog.selection : "none"}</div>
              </div>
            );
          })}
        </section>
      )}

      <form action={boundSubmit}>
        <h2>Open games</h2>
        {openGames.length === 0 && <p>No open games right now.</p>}
        {openGames.map((g) => {
          const snap = g.oddsSnapshots[0];
          const existingSpread = pickLookup.get(`${g.id}_SPREAD`);
          const existingTotal = pickLookup.get(`${g.id}_TOTAL`);
          const existingDog = pickLookup.get(`${g.id}_DOG`);
          const lockAt = lockTimeFor(g.commenceTime);

          return (
            <div key={g.id} style={{ border: "1px solid #ddd", padding: "0.75rem", marginBottom: "0.75rem" }}>
              <strong>
                {g.awayTeam} @ {g.homeTeam}
              </strong>
              <div style={{ fontSize: "0.85em", color: "#666" }}>
                Locks {lockAt.toLocaleString()} &middot; line shown is informational, not final until lock
              </div>

              {snap ? (
                <>
                  <div style={{ marginTop: "0.5rem" }}>
                    <label>
                      <input
                        type="radio"
                        name={`spread_${g.id}`}
                        value="away"
                        defaultChecked={existingSpread?.selection === g.awayTeam}
                      />{" "}
                      {g.awayTeam} {snap.spreadAway != null && snap.spreadAway > 0 ? "+" : ""}
                      {snap.spreadAway}
                    </label>
                    <br />
                    <label>
                      <input
                        type="radio"
                        name={`spread_${g.id}`}
                        value="home"
                        defaultChecked={existingSpread?.selection === g.homeTeam}
                      />{" "}
                      {g.homeTeam} {snap.spreadHome != null && snap.spreadHome > 0 ? "+" : ""}
                      {snap.spreadHome}
                    </label>
                  </div>

                  <div style={{ marginTop: "0.5rem" }}>
                    <label>
                      <input
                        type="radio"
                        name={`total_${g.id}`}
                        value="over"
                        defaultChecked={existingTotal?.selection === "over"}
                      />{" "}
                      Over {snap.total}
                    </label>
                    <br />
                    <label>
                      <input
                        type="radio"
                        name={`total_${g.id}`}
                        value="under"
                        defaultChecked={existingTotal?.selection === "under"}
                      />{" "}
                      Under {snap.total}
                    </label>
                  </div>

                  {snap.underdogTeam && !hasLockedDog && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <label>
                        <input
                          type="radio"
                          name="dogPick"
                          value={`${g.id}|${snap.underdogTeam}`}
                          defaultChecked={existingDog?.selection === snap.underdogTeam}
                        />{" "}
                        Make {snap.underdogTeam} my dog pick
                      </label>
                    </div>
                  )}
                </>
              ) : (
                <p>Odds not posted yet for this game.</p>
              )}
            </div>
          );
        })}

        <button type="submit">Save picks</button>
      </form>
    </main>
  );
}
