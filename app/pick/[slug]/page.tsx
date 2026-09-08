import { prisma } from "@/lib/db";
import { isPastLockDeadline } from "@/lib/lock";
import { spreadMove } from "@/lib/format";
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

    // Spread movement is oriented by distance from pick'em, not raw subtraction
    // (a favorite going -9.5 -> -7.5 has SHRUNK, ▼) - see spreadMove().
    const spreadHomeMove =
      latest && opening && latest.spreadHome != null && opening.spreadHome != null
        ? spreadMove(latest.spreadHome, opening.spreadHome)
        : null;
    const spreadAwayMove =
      latest && opening && latest.spreadAway != null && opening.spreadAway != null
        ? spreadMove(latest.spreadAway, opening.spreadAway)
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
      pastLockDeadline: isPastLockDeadline(g.commenceTime),
      isFinal: g.isFinal,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
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
            capturedAtDisplay:
              latest.capturedAt.toLocaleString("en-US", {
                timeZone: "America/Chicago",
                dateStyle: "medium",
                timeStyle: "short",
              }) + " CT",
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
        graded: !!spreadPick?.graded,
        isWin: spreadPick?.isWin ?? null,
        isPush: spreadPick?.isPush ?? null,
      },
      total: {
        pickId: totalPick?.id ?? null,
        selection: totalPick?.selection ?? null,
        locked: !!totalPick?.locked,
        lockedLine: totalPick?.lockedLine ?? null,
        lockedOdds: totalPick?.lockedOdds ?? null,
        lockedBook: totalPick?.lockedBook ?? null,
        graded: !!totalPick?.graded,
        isWin: totalPick?.isWin ?? null,
        isPush: totalPick?.isPush ?? null,
      },
      dog: latest?.underdogTeam
        ? {
            pickId: dogPick?.id ?? null,
            selection: dogPick?.selection ?? null,
            locked: !!dogPick?.locked,
            dogSpreadValue: dogPick?.dogSpreadValue ?? null,
            lockedOdds: dogPick?.lockedOdds ?? null,
            lockedBook: dogPick?.lockedBook ?? null,
            graded: !!dogPick?.graded,
            isWin: dogPick?.isWin ?? null,
            pointsEarned: dogPick?.pointsEarned ?? null,
          }
        : null,
      lockedByOthers: lockedByOthersByGame.get(g.id) ?? [],
    };
  });

  const voidedGames = games.filter((g) => g.voided);

  // Nudges for the new manual-only locking rule.
  const pickSlots = gameViews.flatMap((gv) => {
    const s = [
      { has: !!gv.spread.pickId, locked: gv.spread.locked, past: gv.pastLockDeadline },
      { has: !!gv.total.pickId, locked: gv.total.locked, past: gv.pastLockDeadline },
    ];
    if (gv.dog) s.push({ has: !!gv.dog.pickId, locked: gv.dog.locked, past: gv.pastLockDeadline });
    return s;
  });
  const openPickCount = pickSlots.filter((s) => s.has && !s.locked && !s.past).length;
  const missedLockCount = pickSlots.filter((s) => s.has && !s.locked && s.past).length;

  return (
    <main>
      <h1>{user.name}&apos;s Picks</h1>
      <WeekNav basePath={`/pick/${params.slug}`} weekNumber={weekNumber} minWeek={minWeek} maxWeek={maxWeek} isCurrent={isCurrentWeek} />
      <p className="subtext">
        {lockedSideCount}/5 picks locked &middot; dog pick {lockedDogPick ? "locked" : "not locked"}
        <br />
        You must lock each pick yourself before its game &mdash; the window closes 30 minutes
        before kickoff. Anything not locked by then doesn&apos;t count. Locks are final (only
        the admin can undo one).
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
      {missedLockCount > 0 && (
        <p className="banner-error">
          {missedLockCount} selected pick{missedLockCount > 1 ? "s" : ""} {missedLockCount > 1 ? "were" : "was"} never
          locked before kickoff and {missedLockCount > 1 ? "don't" : "doesn't"} count this week.
        </p>
      )}
      {openPickCount > 0 && isCurrentWeek && (
        <p className="banner-note">
          {openPickCount} pick{openPickCount > 1 ? "s are" : " is"} selected but not locked. Lock{" "}
          {openPickCount > 1 ? "each one" : "it"} before that game&apos;s kickoff or it won&apos;t count.
        </p>
      )}
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
