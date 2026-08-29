import { prisma } from "@/lib/db";
import { isGameLocked, lockTimeFor, WEEK_WINDOW_DAYS } from "@/lib/lock";
import PickForm from "./PickForm";
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

  // Only this week's slate - Odds API returns the whole season, so cut it off
  const windowEnd = new Date(Date.now() + WEEK_WINDOW_DAYS * 86_400_000);

  const games = await prisma.game.findMany({
    where: { weekId: week.id, commenceTime: { lte: windowEnd } },
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

  const openGamesView = openGames.map((g) => {
    const snap = g.oddsSnapshots[0] ?? null;
    return {
      id: g.id,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      lockAtDisplay: lockTimeFor(g.commenceTime).toLocaleString(),
      snap: snap
        ? {
            spreadHome: snap.spreadHome,
            spreadAway: snap.spreadAway,
            total: snap.total,
            underdogTeam: snap.underdogTeam,
          }
        : null,
      existingSpread: pickLookup.get(`${g.id}_SPREAD`)?.selection,
      existingTotal: pickLookup.get(`${g.id}_TOTAL`)?.selection,
      existingDog: pickLookup.get(`${g.id}_DOG`)?.selection,
    };
  });

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

      <PickForm slug={params.slug} openGames={openGamesView} hasLockedDog={hasLockedDog} />
    </main>
  );
}
