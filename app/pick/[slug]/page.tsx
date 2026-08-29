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
        <p className="subtext">Ask the commissioner to pull odds first.</p>
      </main>
    );
  }

  const { start, end } = getCurrentWeekBounds();

  const games = await prisma.game.findMany({
    where: { weekId: week.id, commenceTime: { gte: start, lte: end } },
    include: { oddsSnapshots: { orderBy: { capturedAt: "asc" } } }, // full history, for movement
    orderBy: { commenceTime: "asc" },
  });

  const picks = await prisma.pick.findMany({ where: { userId: user.id, weekId: week.id } });
  const pickLookup = new Map<string, (typeof picks)[number]>();
  for (const p of picks) pickLookup.set(`${p.gameId}_${p.pickType}`, p);

  const gameIds = games.map((g) => g.id);
  const lockedPicksEveryone = await prisma.pick.findMany({
    where: { gameId: { in: gameIds }, locked: true, userId: { not: user.id } },
    include: { user: true },
  });
  const lockedByOthersByGame = new Map<string, { name: string; pickType: string; selection: string }[]>();
  for (const p of lockedPicksEveryone) {
    const list = lockedByOthersByGame.get(p.gameId) ?? [];
    list.push({ name: p.user.name, pickType: p.pickType, selection: p.selection });
    lockedByOthersByGame.set(p.gameId, list);
  }

  const allSnapshotTimes = games.flatMap((g) => g.oddsSnapshots.map((s) => s.capturedAt));
  const lastUpdated = allSnapshotTimes.length
    ? allSnapshotTimes.sort((a, b) => b.getTime() - a.getTime())[0]
    : null;

  const lockedSideCount = picks.filter(
    (p) => (p.pickType === "SPREAD" || p.pickType === "TOTAL") && p.locked
  ).length;
  const lockedDogPick = picks.find((p) => p.pickType === "DOG" && p.locked);

  const gameViews = games.map((g) => {
    const snapshots = g.oddsSnapshots;
    const latest = snapshots[snapshots.length - 1] ?? null;
    const opening = snapshots[0] ?? null;

    const spreadHomeMove =
      latest && opening && latest.spreadHome != null && opening.spreadHome != null
        ? Math.round((latest.spreadHome - opening.spreadHome) * 10) / 10
        : null;
    const spreadAwayMove =
      latest && opening && latest.spreadAway != null && opening.spreadAway != null
        ? Math.round((latest.spreadAway - opening.spreadAway) * 10) / 10
        : null;
    const totalMove =
      latest && opening && latest.total != null && opening.total != null
        ? Math.round((latest.total - opening.total) * 10) / 10
        : null;

    const spreadPick = pickLookup.get(`${g.id}_SPREAD`);
    const totalPick = pickLookup.get(`${g.id}_TOTAL`);
    const dogPick = pickLookup.get(`${g.id}_DOG`);

    return {
      id: g.id,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      homeAbbr: g.homeAbbr,
      awayAbbr: g.awayAbbr,
      homeLogo: g.homeLogo,
      awayLogo: g.awayLogo,
      kickoffDisplay:
        g.commenceTime.toLocaleString("en-US", {
          timeZone: "America/Chicago",
          dateStyle: "medium",
          timeStyle: "short",
        }) + " CT",
      autoLockDisplay:
        new Date(g.commenceTime.getTime() - 30 * 60_000).toLocaleString("en-US", {
          timeZone: "America/Chicago",
          dateStyle: "medium",
          timeStyle: "short",
        }) + " CT",
      pastAutoLock: isPastAutoLock(g.commenceTime),
      snap: latest
        ? {
            spreadHome: latest.spreadHome,
            spreadAway: latest.spreadAway,
            total: latest.total,
            underdogTeam: latest.underdogTeam,
          }
        : null,
      movement: { spreadHome: spreadHomeMove, spreadAway: spreadAwayMove, total: totalMove },
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
      dog: latest?.underdogTeam
        ? {
            pickId: dogPick?.id ?? null,
            selection: dogPick?.selection ?? null,
            locked: !!dogPick?.locked,
            dogSpreadValue: dogPick?.dogSpreadValue ?? null,
          }
        : null,
      lockedByOthers: lockedByOthersByGame.get(g.id) ?? [],
    };
  });

  return (
    <main>
      <h1>{user.name}&apos;s picks</h1>
      <p className="subtext">
        {lockedSideCount}/5 side picks locked &middot; dog pick {lockedDogPick ? "locked" : "not locked"}
        <br />
        Last updated:{" "}
        {lastUpdated
          ? lastUpdated.toLocaleString("en-US", {
              timeZone: "America/Chicago",
              dateStyle: "medium",
              timeStyle: "short",
            }) + " CT"
          : "never yet"}
      </p>
      <PickForm slug={params.slug} games={gameViews} hasLockedDog={!!lockedDogPick} />
    </main>
  );
}
