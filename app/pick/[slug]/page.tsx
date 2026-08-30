import { prisma } from "@/lib/db";
import { isPastAutoLock } from "@/lib/lock";
import { getOrCreateCurrentWeek, getWeekNumberForDate } from "@/lib/currentWeek";
import PickForm from "./PickForm";
import WeekNav from "../../WeekNav";
import { notFound } from "next/navigation";

export default async function PickPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { week?: string };
}) {
  const user = await prisma.user.findUnique({ where: { pickSlug: params.slug } });
  if (!user) return notFound();

  await getOrCreateCurrentWeek(); // ensures the current week row exists
  const currentWeekNumber = getWeekNumberForDate();

  const allWeeksMeta = await prisma.week.findMany({
    where: { seasonYear: 2026 },
    orderBy: { weekNumber: "asc" },
  });
  const minWeek = allWeeksMeta[0]?.weekNumber ?? currentWeekNumber;
  const maxWeek = allWeeksMeta[allWeeksMeta.length - 1]?.weekNumber ?? currentWeekNumber;
  const requestedWeekNumber = searchParams.week ? Number(searchParams.week) : currentWeekNumber;
  const weekNumber = Math.max(minWeek, Math.min(maxWeek, requestedWeekNumber));
  const week = allWeeksMeta.find((w) => w.weekNumber === weekNumber);
  const isCurrentWeek = weekNumber === currentWeekNumber;

  if (!week) {
    return (
      <main>
        <h1>{user.name}&apos;s Picks</h1>
        <WeekNav basePath={`/pick/${params.slug}`} weekNumber={weekNumber} minWeek={minWeek} maxWeek={maxWeek} isCurrent={isCurrentWeek} />
        <p className="subtext">No games found for week {weekNumber}.</p>
      </main>
    );
  }

  const games = await prisma.game.findMany({
    where: { weekId: week.id },
    include: { oddsSnapshots: { orderBy: { capturedAt: "asc" } } }, // full history, for movement
    orderBy: { commenceTime: "asc" },
  });

  const picks = await prisma.pick.findMany({ where: { userId: user.id, weekId: week.id } });
  const pickLookup = new Map<string, (typeof picks)[number]>();
  for (const p of picks) pickLookup.set(`${p.gameId}_${p.pickType}`, p);

  // --- Full interactive view, for whatever week is currently being viewed ---
  const gameIds = games.map((g) => g.id);
  const lockedPicksEveryone = await prisma.pick.findMany({
    where: { gameId: { in: gameIds }, locked: true, userId: { not: user.id } },
    include: { user: true },
  });
  const lockedByOthersByGame = new Map<
    string,
    { name: string; pickType: string; selection: string; lockedLine: number | null; dogSpreadValue: number | null; lockedBook: string | null }[]
  >();
  for (const p of lockedPicksEveryone) {
    const list = lockedByOthersByGame.get(p.gameId) ?? [];
    list.push({
      name: p.user.name,
      pickType: p.pickType,
      selection: p.selection,
      lockedLine: p.lockedLine,
      dogSpreadValue: p.dogSpreadValue,
      lockedBook: p.lockedBook,
    });
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

  const gameViews = games
    .filter((g) => !g.voided)
    .map((g) => {
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
      broadcast: g.broadcast,
      kickoffDisplay:
        g.commenceTime.toLocaleString("en-US", {
          timeZone: "America/Chicago",
          dateStyle: "medium",
          timeStyle: "short",
        }) + " CT",
      pastAutoLock: isPastAutoLock(g.commenceTime),
      snap: latest
        ? {
            spreadHome: latest.spreadHome,
            spreadAway: latest.spreadAway,
            spreadHomePrice: latest.spreadHomePrice,
            spreadAwayPrice: latest.spreadAwayPrice,
            total: latest.total,
            totalOverPrice: latest.totalOverPrice,
            totalUnderPrice: latest.totalUnderPrice,
            mlHome: latest.mlHome,
            mlAway: latest.mlAway,
            underdogTeam: latest.underdogTeam,
            sourceBook: latest.sourceBook,
          }
        : null,
      movement: { spreadHome: spreadHomeMove, spreadAway: spreadAwayMove, total: totalMove },
      spread: {
        pickId: spreadPick?.id ?? null,
        selection: spreadPick?.selection ?? null,
        locked: !!spreadPick?.locked,
        lockedLine: spreadPick?.lockedLine ?? null,
        lockedOdds: spreadPick?.lockedOdds ?? null,
        lockedBook: spreadPick?.lockedBook ?? null,
      },
      total: {
        pickId: totalPick?.id ?? null,
        selection: totalPick?.selection ?? null,
        locked: !!totalPick?.locked,
        lockedLine: totalPick?.lockedLine ?? null,
        lockedOdds: totalPick?.lockedOdds ?? null,
        lockedBook: totalPick?.lockedBook ?? null,
      },
      dog: latest?.underdogTeam
        ? {
            pickId: dogPick?.id ?? null,
            selection: dogPick?.selection ?? null,
            locked: !!dogPick?.locked,
            dogSpreadValue: dogPick?.dogSpreadValue ?? null,
            lockedOdds: dogPick?.lockedOdds ?? null,
            lockedBook: dogPick?.lockedBook ?? null,
          }
        : null,
      lockedByOthers: lockedByOthersByGame.get(g.id) ?? [],
    };
  });

  const voidedGames = games.filter((g) => g.voided);

  return (
    <main>
      <h1>{user.name}&apos;s Picks</h1>
      <WeekNav basePath={`/pick/${params.slug}`} weekNumber={weekNumber} minWeek={minWeek} maxWeek={maxWeek} isCurrent={isCurrentWeek} />
      <p className="subtext">
        {lockedSideCount}/5 picks locked &middot; dog pick {lockedDogPick ? "locked" : "not locked"}
        <br />
        Games lock automatically 30 minutes before kickoff if not locked manually.
        {!isCurrentWeek && (
          <>
            <br />
            {weekNumber > currentWeekNumber
              ? "Picking ahead \u2014 this week has its own separate 5 picks + dog pick, counted independently."
              : "This week has passed \u2014 anything shown here is locked in for good."}
          </>
        )}
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
      {voidedGames.length > 0 && (
        <p className="banner-note">
          {voidedGames.length} game{voidedGames.length > 1 ? "s" : ""} this week{" "}
          {voidedGames.length > 1 ? "were" : "was"} postponed/cancelled and won&apos;t count.
        </p>
      )}
      <PickForm slug={params.slug} games={gameViews} hasLockedDog={!!lockedDogPick} isCurrentWeek={isCurrentWeek} />
    </main>
  );
}
