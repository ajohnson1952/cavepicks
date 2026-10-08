import { prisma } from "@/lib/db";
import { formatSpread, formatOdds, bookAbbr } from "@/lib/format";
import { getOrCreateCurrentWeek, getWeekNumberForDate, SEASON_YEAR } from "@/lib/currentWeek";
import { fetchEspnScoreboard, teamNamesMatch, toYyyymmdd } from "@/lib/espnScores";
import { isPastLockDeadline } from "@/lib/lock";
import { buildPickShareText } from "@/lib/pickShareText";
import WeekNav from "../WeekNav";
import CopyPicksButton from "./CopyPicksButton";
import { GHOST_NAME } from "@/lib/ghost";
import RateUsJoke from "../RateUsJoke"; // temporary joke - see that file for how to remove it
import { getLinePaths, lineValue, formatValue, valueTone, type LineValue } from "@/lib/lineValue";

export const dynamic = "force-dynamic";

function abbr(selection: string, homeTeam: string, homeAbbr: string | null, awayTeam: string, awayAbbr: string | null) {
  if (selection === homeTeam) return homeAbbr ?? selection;
  if (selection === awayTeam) return awayAbbr ?? selection;
  return selection;
}

// Builds the trailing "(-110, FD)" parenthetical (juice + book) from whichever
// pieces exist, so callers don't each hand-roll the join logic. The line
// itself goes OUTSIDE, next to the team: "SC +13.5 (-114, FD)".
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

// The little coloured number after a locked pick: points its line is better
// (+, green) or worse (-, red) than the close - or than the current line, if
// the game hasn't kicked off yet.
function ValueChip({ v }: { v: LineValue }) {
  return <span className={`line-chip ${valueTone(v.value)}`}>{formatValue(v.value)}</span>;
}

// One pick on a card. When there's a line history for it the row can be tapped
// open to show open -> locked -> close; otherwise it's the plain row it always was.
function PickRow({
  className,
  style,
  v,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  v: LineValue | null;
  children: React.ReactNode;
}) {
  if (!v) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  return (
    <details className={`line-row ${className ?? ""}`} style={style}>
      <summary>{children}</summary>
      <div className="line-trail mono">
        {v.open != null && (
          <>
            <span>open</span> {v.open} <span>&rarr;</span>{" "}
          </>
        )}
        <span>locked</span> <strong>{v.locked}</strong> <span>&rarr; {v.lastLabel}</span> {v.last}
      </div>
    </details>
  );
}

function ValueTotal({ values }: { values: (LineValue | null)[] }) {
  const have = values.filter((v): v is LineValue => v != null);
  if (have.length === 0) return null;
  const total = Math.round(have.reduce((s, v) => s + v.value, 0) * 10) / 10;
  return (
    <span className={`line-total ${valueTone(total)}`}>
      {formatValue(total)} pts line value
    </span>
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

export default async function BoardPage(props: { searchParams: Promise<{ week?: string }> }) {
  const searchParams = await props.searchParams;
  await getOrCreateCurrentWeek(); // ensures the current week row exists
  const currentWeekNumber = getWeekNumberForDate();

  const allWeeksMeta = await prisma.week.findMany({
    where: { seasonYear: SEASON_YEAR },
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
    include: { game: true },
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

  // "Yahngo" the ghost player's locked picks this week (lib/ghost.ts). Its
  // own table, shown for reference only - and never allowed to break the board.
  const ghostPicks = await prisma.ghostPick
    .findMany({ where: { weekId: week.id }, include: { game: true }, orderBy: { game: { commenceTime: "asc" } } })
    .catch(() => []);
  const ghostSides = ghostPicks.filter((p) => p.pickType !== "DOG");
  const ghostDog = ghostPicks.find((p) => p.pickType === "DOG");

  // Open / last line for every game someone (or the bot) has a locked pick on.
  // Never allowed to break the board - without it the picks just show no chips.
  const linePaths = await getLinePaths(
    [...picks, ...ghostPicks].filter((p) => p.lockedLine != null || p.dogSpreadValue != null).map((p) => p.gameId)
  ).catch((e) => {
    console.error("board: line paths lookup failed", e);
    return new Map();
  });
  const now = new Date();
  const valueOf = (p: (typeof picks)[number] | (typeof ghostPicks)[number]) => lineValue(p, linePaths, now);

  const picksByUser = new Map<string, typeof picks>();
  for (const p of picks) {
    const list = picksByUser.get(p.userId) ?? [];
    list.push(p);
    picksByUser.set(p.userId, list);
  }

  return (
    <main>
      <RateUsJoke />
      <h1>The Board</h1>
      <WeekNav basePath="/board" weekNumber={weekNumber} minWeek={minWeek} maxWeek={maxWeek} isCurrent={weekNumber === currentWeekNumber} />
      <p className="subtext">Week {week.weekNumber} &middot; everyone&apos;s picks, live.</p>
      {linePaths.size > 0 && (
        <p className="meta" style={{ margin: "-6px 0 12px" }}>
          The coloured number is how many points a lock beat (+) or trailed (&minus;) the closing line &mdash; or the
          current line, until kickoff. Tap a pick for open &rarr; locked &rarr; close.
        </p>
      )}

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
              <ValueTotal values={userPicks.map(valueOf)} />
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
              const book = p.lockedBook ?? null;
              const missedLock = !p.locked && isPastLockDeadline(p.game.commenceTime);

              // Only a locked pick has a number to show - an unlocked pick
              // never adopts a line (there's no auto-lock), so it just reads
              // as a bare side with a "(not locked)" tag.
              let pickLabel: string;
              let lineNumber = "";
              if (p.pickType === "SPREAD") {
                // "SC +13.5 (-114, FD)": the line sits right next to the team, like
                // totals ("o57.5 (-110, FD)"); only the juice + book go in the parens.
                pickLabel = abbr(p.selection, p.game.homeTeam, p.game.homeAbbr, p.game.awayTeam, p.game.awayAbbr);
                if (p.lockedLine != null) {
                  pickLabel += ` ${formatSpread(p.lockedLine)}`;
                  lineNumber = metaParen(null, p.lockedOdds, book);
                }
              } else {
                pickLabel =
                  p.lockedLine != null
                    ? `${p.selection === "over" ? "o" : "u"}${p.lockedLine}`
                    : p.selection;
                if (p.lockedLine != null) {
                  lineNumber = metaParen(null, p.lockedOdds, book);
                }
              }

              const v = valueOf(p);
              return (
                <PickRow key={p.id} className={rClass} style={{ fontSize: "13px", marginBottom: "4px" }} v={v}>
                  <span className="mono" style={{ color: rClass ? "inherit" : "var(--dim)" }}>
                    {p.pickType === "SPREAD" ? "SPRD" : "TOTL"}
                  </span>{" "}
                  <Logo src={p.game.awayLogo} alt={p.game.awayTeam} />
                  {p.game.awayAbbr ?? p.game.awayTeam} @{" "}
                  <Logo src={p.game.homeLogo} alt={p.game.homeTeam} />
                  {p.game.homeAbbr ?? p.game.homeTeam} &mdash; {pickLabel}
                  {lineNumber}
                  {v && <ValueChip v={v} />}
                  {p.game.voided && (
                    <span className="meta" style={{ color: "var(--amber-dim)" }}>
                      {` (voided \u2014 ${p.game.voidReason})`}
                    </span>
                  )}
                  {!p.game.voided && !p.locked && !p.graded && (
                    <span className="meta" style={missedLock ? { color: "var(--down)" } : undefined}>
                      {missedLock ? " — not locked, no pick" : " (not locked)"}
                    </span>
                  )}
                  {!p.game.voided && isLive && !p.graded && (
                    <span className="live-badge" style={{ marginLeft: "6px" }}>
                      <span className="live-dot" /> LIVE
                    </span>
                  )}
                  <div className="meta" style={{ marginTop: "1px" }}>
                    {kickoffDisplay(p.game.commenceTime)}
                    {p.game.broadcast ? ` \u00b7 ${p.game.broadcast}` : ""}
                  </div>
                </PickRow>
              );
            })}
            {dogPick && (
              <PickRow
                className={resultClass(dogPick.graded, dogPick.isWin, dogPick.isPush)}
                style={{ fontSize: "13px", marginTop: "6px" }}
                v={valueOf(dogPick)}
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
                  <span>
                    {` ${dogPick.dogSpreadValue ?? "?"} pts`}
                    {(() => {
                      const parts = [
                        dogPick.lockedOdds != null ? `${formatOdds(dogPick.lockedOdds)} ML` : null,
                        dogPick.lockedBook ? bookAbbr(dogPick.lockedBook) : null,
                      ].filter(Boolean);
                      return parts.length ? ` (${parts.join(", ")})` : "";
                    })()}
                  </span>
                ) : isPastLockDeadline(dogPick.game.commenceTime) ? (
                  <span className="meta" style={{ color: "var(--down)" }}> &mdash; not locked, no pick</span>
                ) : (
                  <span className="meta"> (not locked)</span>
                )}
                {(() => {
                  const v = valueOf(dogPick);
                  return v ? <ValueChip v={v} /> : null;
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
              </PickRow>
            )}
          </div>
        );
      })}

      {ghostPicks.length > 0 && (
        <div className="card ghost-card">
          <div className="matchup">
            <img
              src="/yahn-joe.png"
              alt=""
              width={18}
              height={18}
              style={{ borderRadius: "50%", verticalAlign: "-3px", marginRight: "6px", opacity: 0.6 }}
            />
            {GHOST_NAME} <span style={{ fontWeight: 400 }}>&middot; bot</span>
            <ValueTotal values={ghostPicks.map(valueOf)} />
          </div>
          <div className="meta" style={{ marginTop: "2px" }}>
            The yahngorithm model, for reference only &middot; not in the pot &middot; {ghostSides.length}/5 locked &middot; dog{" "}
            {ghostDog ? "locked" : "\u2014"}
          </div>
          <div className="divider" />
          {ghostSides.map((p) => {
            const rClass = resultClass(p.graded, p.isWin, p.isPush);
            const label =
              p.pickType === "SPREAD"
                ? `${abbr(p.selection, p.game.homeTeam, p.game.homeAbbr, p.game.awayTeam, p.game.awayAbbr)}${
                    p.lockedLine != null ? ` ${formatSpread(p.lockedLine)}` : ""
                  }`
                : `${p.selection === "over" ? "o" : "u"}${p.lockedLine ?? ""}`;
            const paren = metaParen(null, p.lockedOdds, p.lockedBook);
            const v = valueOf(p);
            return (
              <PickRow key={p.id} className={rClass} style={{ fontSize: "13px", marginBottom: "4px" }} v={v}>
                <span className="mono">{p.pickType === "SPREAD" ? "SPRD" : "TOTL"}</span>{" "}
                <Logo src={p.game.awayLogo} alt={p.game.awayTeam} />
                {p.game.awayAbbr ?? p.game.awayTeam} @ <Logo src={p.game.homeLogo} alt={p.game.homeTeam} />
                {p.game.homeAbbr ?? p.game.homeTeam} &mdash; {label}
                {paren}
                {v && <ValueChip v={v} />}
                {liveGameIds.has(p.game.id) && !p.graded && (
                  <span className="live-badge" style={{ marginLeft: "6px" }}>
                    <span className="live-dot" /> LIVE
                  </span>
                )}
              </PickRow>
            );
          })}
          {ghostDog && (
            <PickRow
              className={resultClass(ghostDog.graded, ghostDog.isWin, ghostDog.isPush)}
              style={{ fontSize: "13px", marginTop: "6px" }}
              v={valueOf(ghostDog)}
            >
              <span className="mono">DOG</span>{" "}
              <Logo src={ghostDog.game.awayLogo} alt={ghostDog.game.awayTeam} />
              {ghostDog.game.awayAbbr ?? ghostDog.game.awayTeam} @{" "}
              <Logo src={ghostDog.game.homeLogo} alt={ghostDog.game.homeTeam} />
              {ghostDog.game.homeAbbr ?? ghostDog.game.homeTeam}
              {" \u2014 "}
              {abbr(ghostDog.selection, ghostDog.game.homeTeam, ghostDog.game.homeAbbr, ghostDog.game.awayTeam, ghostDog.game.awayAbbr)}
              {ghostDog.graded ? (
                <span style={{ marginLeft: "6px" }}>
                  {ghostDog.isWin ? `hit \u2014 +${ghostDog.pointsEarned} pts` : "missed \u2014 0 pts"}
                </span>
              ) : (
                <span>
                  {` ${ghostDog.dogSpreadValue ?? "?"} pts`}
                  {ghostDog.lockedOdds != null || ghostDog.lockedBook
                    ? ` (${[
                        ghostDog.lockedOdds != null ? `${formatOdds(ghostDog.lockedOdds)} ML` : null,
                        ghostDog.lockedBook ? bookAbbr(ghostDog.lockedBook) : null,
                      ]
                        .filter(Boolean)
                        .join(", ")})`
                    : ""}
                </span>
              )}
              {(() => {
                const v = valueOf(ghostDog);
                return v ? <ValueChip v={v} /> : null;
              })()}
            </PickRow>
          )}
          <div className="meta" style={{ marginTop: "8px" }}>
            It locks its picks early in the week, at the line showing when the model&apos;s picks come in.
          </div>
        </div>
      )}
    </main>
  );
}
