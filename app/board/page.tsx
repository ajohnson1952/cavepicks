import { prisma } from "@/lib/db";
import { formatSpread, formatOdds, bookAbbr } from "@/lib/format";
import { getOrCreateCurrentWeek, getWeekNumberForDate } from "@/lib/currentWeek";
import { fetchEspnScoreboard, teamNamesMatch, toYyyymmdd } from "@/lib/espnScores";
import { buildPickShareText } from "@/lib/pickShareText";
import WeekNav from "../WeekNav";
import CopyPicksButton from "./CopyPicksButton";

export const dynamic = "force-dynamic";

function abbr(selection: string, homeTeam: string, homeAbbr: string | null, awayTeam: string, awayAbbr: string | null) {
  if (selection === homeTeam) return homeAbbr ?? selection;
  if (selection === awayTeam) return awayAbbr ?? selection;
  return selection;
}

// Builds the trailing "(+3.5 -110, FD)" / "(-110, FD)" parenthetical from
// whichever pieces exist, so callers don't each hand-roll the join logic.
function metaParen(numberPart: string | null, oddsVal: number | null | undefined, bookKey: string | null): string {
  let s = numberPart ?? "";
  if (oddsVal != null) s += (s ? " " : "") + formatOdds(oddsVal);
  const abbrev = bookAbbr(bookKey);
  if (abbrev) s += (s ? ", " : "") + abbrev;
  return s ? ` (${s})` : "";
}

function resultClass(graded: boolean, isWin: boolean | null, isPush: boolean | null): string {
  if (!graded) return "";
  if (isPush) return "pick-push";
  if (isWin) return "pick-win";
  return "pick-loss";
}

function Logo({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      style={{ width: "14px", height: "14px", objectFit: "contain", verticalAlign: "-2px", marginRight: "4px" }}
    />
  );
}

function kickoffDisplay(date: Date) {
  return (
    date.toLocaleString("en-US", {
      timeZone: "America/Chicago",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }) + " CT"
  );
}

export default async function BoardPage({ searchParams }: { searchParams: { week?: string } }) {
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

  if (!week) {
    return (
      <main>
        <h1>The Board</h1>
        <WeekNav basePath="/board" weekNumber={weekNumber} minWeek={minWeek} maxWeek={maxWeek} isCurrent={weekNumber === currentWeekNumber} />
        <p className="subtext">No games found for week {weekNumber}.</p>
      </main>
    );
  }

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const picks = await prisma.pick.findMany({
    where: { weekId: week.id },
    include: { game: { include: { oddsSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 } } } },
    orderBy: { game: { commenceTime: "asc" } },
  });

  // Fresh live-game check on every page load - checks today +/- 1 day so
  // nothing near a midnight boundary gets missed.
  const weekGames = await prisma.game.findMany({ where: { weekId: week.id } });
  const today = new Date();
  const datesToCheck = Array.from(
    new Set([
      toYyyymmdd(new Date(today.getTime() - 86_400_000)),
      toYyyymmdd(today),
      toYyyymmdd(new Date(today.getTime() + 86_400_000)),
    ])
  );
  const liveResultsArrays = await Promise.all(datesToCheck.map((d) => fetchEspnScoreboard(d)));
  const liveResults = liveResultsArrays.flat();

  const liveGameIds = new Set<string>();
  for (const g of weekGames) {
    const match = liveResults.find(
      (r) => teamNamesMatch(g.homeTeam, r.homeTeam) && teamNamesMatch(g.awayTeam, r.awayTeam)
    );
    if (match?.state === "in") liveGameIds.add(g.id);
  }

  const picksByUser = new Map<string, typeof picks>();
  for (const p of picks) {
    const list = picksByUser.get(p.userId) ?? [];
    list.push(p);
    picksByUser.set(p.userId, list);
  }

  return (
    <main>
      <h1>The Board</h1>
      <WeekNav basePath="/board" weekNumber={weekNumber} minWeek={minWeek} maxWeek={maxWeek} isCurrent={weekNumber === currentWeekNumber} />
      <p className="subtext">Week {week.weekNumber} &middot; everyone&apos;s picks, live.</p>

      {users.map((u) => {
        const userPicks = picksByUser.get(u.id) ?? [];
        const sidePicks = userPicks.filter((p) => p.pickType !== "DOG");
        const dogPick = userPicks.find((p) => p.pickType === "DOG");
        const lockedSideCount = sidePicks.filter((p) => p.locked).length;
        const shareText = buildPickShareText(u.name, week.weekNumber, sidePicks, dogPick ?? null);

        return (
          <div key={u.id} className="card">
            <div className="matchup">
              {u.name}
              {shareText && <CopyPicksButton name={u.name} text={shareText} />}
            </div>
            <div className="meta" style={{ marginTop: "2px" }}>
              {lockedSideCount}/5 locked &middot; dog{" "}
              {dogPick ? (dogPick.locked ? "locked" : "picked") : "\u2014"}
            </div>
            <div className="divider" />
            {sidePicks.length === 0 && <p className="subtext" style={{ margin: 0 }}>No picks yet</p>}
            {sidePicks.map((p) => {
              const rClass = resultClass(p.graded, p.isWin, p.isPush);
              const isLive = liveGameIds.has(p.game.id);
              const liveSnap = p.game.oddsSnapshots[0] ?? null;
              const book = p.lockedBook ?? liveSnap?.sourceBook ?? null;

              // Once locked, always show the frozen number. Otherwise fall
              // back to the game's current live line so an open pick isn't
              // shown with no number at all - just make sure it reads as
              // still-moving, not locked (the "(open)" tag below does that).
              let pickLabel: string;
              let lineNumber = "";
              if (p.pickType === "SPREAD") {
                pickLabel = abbr(p.selection, p.game.homeTeam, p.game.homeAbbr, p.game.awayTeam, p.game.awayAbbr);
                if (p.lockedLine != null) {
                  lineNumber = metaParen(formatSpread(p.lockedLine), p.lockedOdds, book);
                } else if (liveSnap) {
                  const isHome = p.selection === p.game.homeTeam;
                  const liveLine = isHome ? liveSnap.spreadHome : liveSnap.spreadAway;
                  const liveOdds = isHome ? liveSnap.spreadHomePrice : liveSnap.spreadAwayPrice;
                  if (liveLine != null) lineNumber = metaParen(formatSpread(liveLine), liveOdds, book);
                }
              } else {
                // Fold the number straight into the pick itself - "o51.5" /
                // "u51.5" - instead of spelling out "over"/"under" and then
                // repeating the same number again in a parenthetical.
                const totalLine = p.lockedLine ?? liveSnap?.total ?? null;
                pickLabel = totalLine != null ? `${p.selection === "over" ? "o" : "u"}${totalLine}` : p.selection;
                if (p.lockedLine != null) {
                  lineNumber = metaParen(null, p.lockedOdds, book);
                } else if (liveSnap?.total != null) {
                  const liveOdds = p.selection === "over" ? liveSnap.totalOverPrice : liveSnap.totalUnderPrice;
                  lineNumber = metaParen(null, liveOdds, book);
                }
              }

              return (
                <div key={p.id} className={rClass} style={{ fontSize: "13px", marginBottom: "4px" }}>
                  <span className="mono" style={{ color: rClass ? "inherit" : "var(--dim)" }}>
                    {p.pickType === "SPREAD" ? "SPRD" : "TOTL"}
                  </span>{" "}
                  <Logo src={p.game.awayLogo} alt={p.game.awayTeam} />
                  {p.game.awayAbbr ?? p.game.awayTeam} @{" "}
                  <Logo src={p.game.homeLogo} alt={p.game.homeTeam} />
                  {p.game.homeAbbr ?? p.game.homeTeam} &mdash; {pickLabel}
                  {lineNumber}
                  {p.game.voided && (
                    <span className="meta" style={{ color: "#b98f42" }}>
                      {` (voided \u2014 ${p.game.voidReason})`}
                    </span>
                  )}
                  {!p.game.voided && !p.locked && !p.graded && <span className="meta"> (open)</span>}
                  {!p.game.voided && isLive && !p.graded && (
                    <span className="live-badge" style={{ marginLeft: "6px" }}>
                      <span className="live-dot" /> LIVE
                    </span>
                  )}
                  <div className="meta" style={{ marginTop: "1px" }}>
                    {kickoffDisplay(p.game.commenceTime)}
                    {p.game.broadcast ? ` \u00b7 ${p.game.broadcast}` : ""}
                  </div>
                </div>
              );
            })}
            {dogPick && (
              <div
                className={resultClass(dogPick.graded, dogPick.isWin, dogPick.isPush)}
                style={{ fontSize: "13px", marginTop: "6px" }}
              >
                <span className="mono" style={{ color: "var(--dim)" }}>DOG</span>{" "}
                <Logo src={dogPick.game.awayLogo} alt={dogPick.game.awayTeam} />
                {dogPick.game.awayAbbr ?? dogPick.game.awayTeam} @{" "}
                <Logo src={dogPick.game.homeLogo} alt={dogPick.game.homeTeam} />
                {dogPick.game.homeAbbr ?? dogPick.game.homeTeam}
                {" \u2014 "}
                {abbr(dogPick.selection, dogPick.game.homeTeam, dogPick.game.homeAbbr, dogPick.game.awayTeam, dogPick.game.awayAbbr)}
                {dogPick.graded ? (
                  <span style={{ marginLeft: "6px" }}>
                    {dogPick.isWin ? `hit \u2014 +${dogPick.pointsEarned} pts` : "missed \u2014 0 pts"}
                  </span>
                ) : dogPick.locked ? (
                  <span>{` (worth ${dogPick.dogSpreadValue ?? "?"} pts${dogPick.lockedOdds != null ? `, ${formatOdds(dogPick.lockedOdds)} ML` : ""}${dogPick.lockedBook ? `, ${bookAbbr(dogPick.lockedBook)}` : ""})`}</span>
                ) : (() => {
                  // Same live-fallback as side picks: an open dog pick still
                  // has a current worth-in-points sitting in the game's
                  // latest snapshot, so show it instead of nothing.
                  const dogSnap = dogPick.game.oddsSnapshots[0] ?? null;
                  if (!dogSnap || dogSnap.underdogTeam !== dogPick.selection) {
                    return <span className="meta"> (open)</span>;
                  }
                  const isHome = dogPick.selection === dogPick.game.homeTeam;
                  const liveWorth = Math.abs((isHome ? dogSnap.spreadHome : dogSnap.spreadAway) ?? 0);
                  const liveOdds = isHome ? dogSnap.mlHome : dogSnap.mlAway;
                  const liveBook = dogSnap.sourceBook ? `, ${bookAbbr(dogSnap.sourceBook)}` : "";
                  return (
                    <span>
                      {` (worth ${liveWorth} pts${liveOdds != null ? `, ${formatOdds(liveOdds)} ML` : ""}${liveBook})`}
                      <span className="meta"> (open)</span>
                    </span>
                  );
                })()}
                {liveGameIds.has(dogPick.game.id) && !dogPick.graded && (
                  <span className="live-badge" style={{ marginLeft: "6px" }}>
                    <span className="live-dot" /> LIVE
                  </span>
                )}
                <div className="meta" style={{ marginTop: "1px" }}>
                  {kickoffDisplay(dogPick.game.commenceTime)}
                  {dogPick.game.broadcast ? ` \u00b7 ${dogPick.game.broadcast}` : ""}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </main>
  );
}
