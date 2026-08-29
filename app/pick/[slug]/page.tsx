import { prisma } from "@/lib/db";
import { isPastAutoLock, getCurrentWeekBounds } from "@/lib/lock";
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

  const { start, end } = getCurrentWeekBounds();

  const games = await prisma.game.findMany({
    where: { weekId: week.id, commenceTime: { gte: start, lte: end } },
    include: { oddsSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
    orderBy: { commenceTime: "asc" },
  });

  const picks = await prisma.pick.findMany({ where: { userId: user.id, weekId: week.id } });
  const pickLookup = new Map<string, (typeof picks)[number]>();
  for (const p of picks) pickLookup.set(`${p.gameId}_${p.pickType}`, p);

  const lockedSideCount = picks.filter(
    (p) => (p.pickType === "SPREAD" || p.pickType === "TOTAL") && p.locked
  ).length;
  const lockedDogPick = picks.find((p) => p.pickType === "DOG" && p.locked);

  const gameViews = games.map((g) => {
    const snap = g.oddsSnapshots[0] ?? null;
    const spreadPick = pickLookup.get(`${g.id}_SPREAD`);
    const totalPick = pickLookup.get(`${g.id}_TOTAL`);
    const dogPick = pickLookup.get(`${g.id}_DOG`);

    return {
      id: g.id,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      autoLockDisplay: new Date(g.commenceTime.getTime() - 30 * 60_000).toLocaleString(),
      pastAutoLock: isPastAutoLock(g.commenceTime),
      snap: snap
        ? {
            spreadHome: snap.spreadHome,
            spreadAway: snap.spreadAway,
            total: snap.total,
            underdogTeam: snap.underdogTeam,
          }
        : null,
      spread: {
        pickId: spreadPick?.id ?? null,
        selection: spreadPick?.selection ?? null,
        locked: !!spreadPick?.locked,
        lockedLine: spreadPick?.lockedLine ?? null,
      },
      total: {
        pickId: totalPick?.id ?? null,
        selection: totalPick?.selection ?? null,
        locked: !!totalPick?.locked,
        lockedLine: totalPick?.lockedLine ?? null,
      },
      dog: snap?.underdogTeam
        ? {
            pickId: dogPick?.id ?? null,
            selection: dogPick?.selection ?? null,
            locked: !!dogPick?.locked,
            dogSpreadValue: dogPick?.dogSpreadValue ?? null,
          }
        : null,
    };
  });

  return (
    <main style={{ maxWidth: 700 }}>
      <h1>{user.name}&apos;s Picks</h1>
      <p>
        {lockedSideCount}/5 side picks locked in &middot; dog pick{" "}
        {lockedDogPick ? "locked in" : "not locked yet"}.
      </p>
      <PickForm slug={params.slug} games={gameViews} hasLockedDog={!!lockedDogPick} />
    </main>
  );
}
