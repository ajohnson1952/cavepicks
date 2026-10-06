"use client";

import { useCallback, useEffect, useState } from "react";
import { clearPick, lockValue, autosaveSelection } from "./actions";
import { hapticCelebrate, hapticError, hapticSuccess, hapticTap } from "@/lib/haptics";
import MoneyShower from "./MoneyShower";
import { formatSpread, formatOdds, bookLabel } from "@/lib/format";
import HapticButton from "../../HapticButton";
import HoldToLock from "../../HoldToLock";

type Snap = {
  spreadHome: number | null;
  spreadAway: number | null;
  spreadHomePrice: number | null;
  spreadAwayPrice: number | null;
  total: number | null;
  totalOverPrice: number | null;
  totalUnderPrice: number | null;
  mlHome: number | null;
  mlAway: number | null;
  underdogTeam: string | null;
  sourceBook: string | null;
  capturedAtDisplay: string;
};

// Opening (first-ever posted) numbers for this game, for the "open" note and
// the value-vs-opener indicator on each pill.
type Movement = {
  openSpreadHome: number | null;
  openSpreadAway: number | null;
  openTotal: number | null;
};

type PickSlot = {
  pickId: string | null;
  selection: string | null;
  locked: boolean;
  lockedLine: number | null;
  lockedOdds: number | null;
  lockedBook: string | null;
  graded: boolean;
  isWin: boolean | null;
  isPush: boolean | null;
};

type DogSlot = {
  pickId: string | null;
  selection: string | null;
  locked: boolean;
  dogSpreadValue: number | null;
  lockedOdds: number | null;
  lockedBook: string | null;
  graded: boolean;
  isWin: boolean | null;
  pointsEarned: number | null;
};

type LockedByOther = {
  name: string;
  pickType: string;
  selection: string;
  lockedLine: number | null;
  dogSpreadValue: number | null;
  lockedBook: string | null;
};

type GameView = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string | null;
  awayAbbr: string | null;
  homeLogo: string | null;
  awayLogo: string | null;
  broadcast: string | null;
  kickoffDisplay: string;
  pastLockDeadline: boolean;
  isFinal: boolean;
  homeScore: number | null;
  awayScore: number | null;
  snap: Snap | null;
  movement: Movement;
  spread: PickSlot;
  total: PickSlot;
  dog: DogSlot | null;
  lockedByOthers: LockedByOther[];
  yahn: YahnInfo;
};

// From the-yahngorithm's feed (lib/yahn.ts): where Joe links, and the side
// the model picked on this game, if any.
type YahnInfo = {
  url: string;
  spreadSide: "home" | "away" | null;
  spreadEdge: number | null;
  totalSide: "over" | "under" | null;
  totalEdge: number | null;
};

// Joe's face in the corner of a pick pill = the model took this side, with
// its edge in points. Pure decoration (pointer-events: none) so it can never
// get in the way of tapping the pill.
function YahnMark({ edge }: { edge: number | null }) {
  return (
    <span className="yahn-mark" title="The yahngorithm model picked this side">
      <img src="/yahn-joe.png" alt="Yahngo's pick" width={15} height={15} />
      {edge != null ? `+${edge}` : ""}
    </span>
  );
}

function computeInitialState(games: GameView[]) {
  const spread: Record<string, "home" | "away" | undefined> = {};
  const total: Record<string, "over" | "under" | undefined> = {};
  let dog: string | undefined;
  for (const g of games) {
    if (g.spread.selection === g.homeTeam) spread[g.id] = "home";
    else if (g.spread.selection === g.awayTeam) spread[g.id] = "away";
    if (g.total.selection === "over" || g.total.selection === "under") {
      total[g.id] = g.total.selection;
    }
    if (g.dog?.selection && g.snap?.underdogTeam === g.dog.selection) {
      dog = `${g.id}|${g.dog.selection}`;
    }
  }
  return { spread, total, dog };
}

function TeamLogo({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      style={{ width: "16px", height: "16px", objectFit: "contain", verticalAlign: "-3px", marginRight: "5px" }}
    />
  );
}

// Line movement since the opener, shown as VALUE for this specific pick:
// green "+2.5" = today's number is 2.5 better for this side than the opening
// line, red "-2.5" = worse. (The old up/down arrows showed the same green
// arrow on both sides of a spread, which read as "good" for both.)
//   spread: your signed line going up is better (+10 -> +12.5, -10 -> -7.5)
//   over:   a lower total is better      under: a higher total is better
// It says nothing about where the money is going - the gray "open" note
// (OpenNote) gives the raw fact for anyone who wants to read it that way.
function valueVsOpen(kind: "spread" | "over" | "under", now: number | null, open: number | null): number | null {
  if (now == null || open == null) return null;
  const d = kind === "over" ? open - now : now - open;
  return Math.round(d * 10) / 10;
}

function ValueMove({ delta }: { delta: number | null }) {
  // Hide sub-half-point noise (and exact zero). Lines move in 0.5 steps.
  if (delta === null || Math.abs(delta) < 0.5) return null;
  return (
    <span className={delta > 0 ? "move-up" : "move-down"} style={{ fontSize: "11px", fontWeight: 700 }}>
      {delta > 0 ? "+" : "\u2212"}
      {Math.abs(delta)}
    </span>
  );
}

// The juice line under a pill, plus the opening number when the line has moved.
function JuiceAndOpen({ juice, open, moved }: { juice: number | null | undefined; open: string | null; moved: boolean }) {
  const parts = [juice != null ? formatOdds(juice) : null, moved && open != null ? `open ${open}` : null].filter(Boolean);
  if (parts.length === 0) return null;
  return <div className="pill-juice">{parts.join(" \u00b7 ")}</div>;
}

const hasMoved = (delta: number | null) => delta !== null && Math.abs(delta) >= 0.5;

// Small coloured "WON / LOST / PUSH" tag on a graded side pick.
function ResultTag({ graded, isWin, isPush }: { graded: boolean; isWin: boolean | null; isPush: boolean | null }) {
  if (!graded) return null;
  const [cls, label] = isPush ? ["pick-push", "PUSH"] : isWin ? ["pick-win", "WON"] : ["pick-loss", "LOST"];
  return <span className={cls} style={{ fontSize: "11px", fontWeight: 700, marginLeft: "6px" }}>{label}</span>;
}

// Final score line - shown on every completed game's card, pick or no pick.
function FinalScore({ g }: { g: GameView }) {
  if (!g.isFinal || g.homeScore == null || g.awayScore == null) return null;
  const away = g.awayAbbr ?? g.awayTeam;
  const home = g.homeAbbr ?? g.homeTeam;
  const awayWon = g.awayScore > g.homeScore;
  const homeWon = g.homeScore > g.awayScore;
  return (
    <div className="meta" style={{ marginTop: "3px", color: "var(--ink)" }}>
      Final:{" "}
      <span style={{ fontWeight: awayWon ? 700 : 400 }}>
        {away} {g.awayScore}
      </span>
      ,{" "}
      <span style={{ fontWeight: homeWon ? 700 : 400 }}>
        {home} {g.homeScore}
      </span>
    </div>
  );
}

export default function PickForm({
  slug,
  games,
  hasLockedDog,
  isCurrentWeek,
}: {
  slug: string;
  games: GameView[];
  hasLockedDog: boolean;
  isCurrentWeek: boolean;
}) {
  const [spreadChoice, setSpreadChoice] = useState<Record<string, "home" | "away" | undefined>>(
    () => computeInitialState(games).spread
  );
  const [totalChoice, setTotalChoice] = useState<Record<string, "over" | "under" | undefined>>(
    () => computeInitialState(games).total
  );
  const [dogChoice, setDogChoice] = useState<string | undefined>(() => computeInitialState(games).dog);
  const [error, setError] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const endCelebration = useCallback(() => setCelebrating(false), []);
  const [search, setSearch] = useState("");

  // Would this lock finish the week (5 locked side picks + a locked dog)?
  // Decided on the tap, before the server round-trip, so Android's
  // celebration buzz fires with the tap (iPhones get HoldToLock's release tick).
  const lockedSides = games.reduce((n, g) => n + (g.spread.locked ? 1 : 0) + (g.total.locked ? 1 : 0), 0);
  const dogLocked = hasLockedDog || games.some((g) => g.dog?.locked);
  function beginLock(kind: "side" | "dog"): boolean {
    const finishing = kind === "side" ? lockedSides === 4 && dogLocked : lockedSides >= 5 && !dogLocked;
    if (finishing) hapticCelebrate();
    else hapticTap();
    return finishing;
  }
  const [onlyMine, setOnlyMine] = useState(false);

  useEffect(() => {
    const init = computeInitialState(games);
    setSpreadChoice(init.spread);
    setTotalChoice(init.total);
    setDogChoice(init.dog);
  }, [games]);

  // Tapping the already-selected side again unselects it (deletes the
  // unlocked pick) - replaces the old separate "clear" button.
  async function unselect(pickType: "SPREAD" | "TOTAL" | "DOG", gameId: string, restore: () => void) {
    const res = await clearPick(slug, gameId, pickType);
    if (res.error) {
      hapticError();
      setError(res.error);
      restore();
    } else {
      setError(null);
    }
  }

  async function pickSpread(g: GameView, value: "home" | "away") {
    hapticTap();
    const prev = spreadChoice[g.id];
    if (prev === value) {
      setSpreadChoice((s) => ({ ...s, [g.id]: undefined }));
      return unselect("SPREAD", g.id, () => setSpreadChoice((s) => ({ ...s, [g.id]: prev })));
    }
    setSpreadChoice((s) => ({ ...s, [g.id]: value }));
    const res = await autosaveSelection(slug, g.id, "SPREAD", value === "home" ? g.homeTeam : g.awayTeam);
    if (res.error) {
      hapticError();
      setError(res.error);
      setSpreadChoice((s) => ({ ...s, [g.id]: prev }));
    } else {
      setError(null);
    }
  }

  async function pickTotal(g: GameView, value: "over" | "under") {
    hapticTap();
    const prev = totalChoice[g.id];
    if (prev === value) {
      setTotalChoice((s) => ({ ...s, [g.id]: undefined }));
      return unselect("TOTAL", g.id, () => setTotalChoice((s) => ({ ...s, [g.id]: prev })));
    }
    setTotalChoice((s) => ({ ...s, [g.id]: value }));
    const res = await autosaveSelection(slug, g.id, "TOTAL", value);
    if (res.error) {
      hapticError();
      setError(res.error);
      setTotalChoice((s) => ({ ...s, [g.id]: prev }));
    } else {
      setError(null);
    }
  }

  async function pickDog(g: GameView) {
    if (!g.snap?.underdogTeam) return;
    hapticTap();
    const prev = dogChoice;
    if (prev === `${g.id}|${g.snap.underdogTeam}`) {
      setDogChoice(undefined);
      return unselect("DOG", g.id, () => setDogChoice(prev));
    }
    setDogChoice(`${g.id}|${g.snap.underdogTeam}`);
    const res = await autosaveSelection(slug, g.id, "DOG", g.snap.underdogTeam);
    if (res.error) {
      hapticError();
      setError(res.error);
      setDogChoice(prev);
    } else {
      setError(null);
    }
  }

  // "Mine" = a saved pick on any slot, or a selection that's mid-save in local
  // state (so a game doesn't blink out of the filtered view before it persists).
  const isMine = (g: GameView) =>
    !!(
      g.spread.pickId ||
      g.total.pickId ||
      g.dog?.pickId ||
      spreadChoice[g.id] ||
      totalChoice[g.id] ||
      (dogChoice && dogChoice.split("|")[0] === g.id)
    );
  const myCount = games.filter(isMine).length;

  const query = search.trim().toLowerCase();
  const visibleGames = games.filter((g) => {
    if (onlyMine && !isMine(g)) return false;
    if (!query) return true;
    return (
      g.homeTeam.toLowerCase().includes(query) ||
      g.awayTeam.toLowerCase().includes(query) ||
      (g.homeAbbr?.toLowerCase().includes(query) ?? false) ||
      (g.awayAbbr?.toLowerCase().includes(query) ?? false)
    );
  });

  return (
    <div>
      {games.length > 0 && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", alignItems: "stretch" }}>
          <input
            type="text"
            className="input"
            placeholder="Search teams..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 0 }}
          />
          <HapticButton
            className="btn"
            onPress={() => setOnlyMine((v) => !v)}
            style={{
              width: "auto",
              whiteSpace: "nowrap",
              borderColor: onlyMine ? "var(--action)" : "var(--border-soft)",
              color: onlyMine ? "var(--action-soft)" : "var(--dim)",
            }}
          >
            My picks ({myCount})
          </HapticButton>
        </div>
      )}

      {celebrating && <MoneyShower onDone={endCelebration} />}
      {/* Floating for the same reason as the "not locked" note in page.tsx -
          an inline banner here pushed the whole list down. Tap to dismiss. */}
      {error && (
        <div className="pick-float pick-float-error" role="alert" onClick={() => setError(null)}>
          {error}
          <span className="meta" style={{ marginLeft: "8px", color: "inherit", opacity: 0.7 }}>
            ✕
          </span>
        </div>
      )}

      {games.length === 0 && <p className="subtext">No games in this week&apos;s slate yet.</p>}
      {games.length > 0 && visibleGames.length === 0 && (
        <p className="subtext">
          {onlyMine && myCount === 0
            ? "You haven't picked any games this week yet."
            : `No games match "${search}".`}
        </p>
      )}

      {visibleGames.map((g) => {
        // Past the lock deadline: no more selecting or locking. A pick that
        // isn't locked by now doesn't count - there is no auto-lock.
        const deadlinePassed = g.pastLockDeadline;
        // A snapshot row can exist with all-null values (or only partially
        // filled) for a game before the book has posted a full line -
        // checking g.snap truthiness alone isn't enough, since that snapshot
        // still exists. Spread and total post independently, so gate each
        // one on its own rather than hiding the whole game until both land.
        const hasSpread = !!g.snap && g.snap.spreadHome != null && g.snap.spreadAway != null;
        const hasTotal = !!g.snap && g.snap.total != null;
        const showSpread = hasSpread || g.spread.locked;
        const showTotal = hasTotal || g.total.locked;
        const hasOdds = showSpread || showTotal || !!g.dog;

        return (
          <div key={g.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
              <div className="matchup">
                <TeamLogo src={g.awayLogo} alt={g.awayTeam} />
                {g.awayAbbr ?? g.awayTeam} @ <TeamLogo src={g.homeLogo} alt={g.homeTeam} />
                {g.homeAbbr ?? g.homeTeam}
              </div>
              <a
                href={g.yahn.url}
                target="_blank"
                rel="noreferrer"
                className="yahn-link"
                aria-label="Open this game on the yahngorithm"
              >
                <img src="/yahn-joe.png" alt="" width={22} height={22} />
              </a>
            </div>
            <div className="meta" style={{ marginTop: "2px" }}>
              {g.kickoffDisplay}
              {g.broadcast ? ` \u00b7 ${g.broadcast}` : ""}
            </div>
            <FinalScore g={g} />

            {g.lockedByOthers.length > 0 && (
              <div style={{ marginTop: "6px" }}>
                {g.lockedByOthers.map((o, i) => {
                  const bookTag = o.lockedBook ? `, ${bookLabel(o.lockedBook)}` : "";
                  const num =
                    o.pickType === "DOG"
                      ? o.dogSpreadValue != null
                        ? ` (worth ${o.dogSpreadValue} pts${bookTag})`
                        : ""
                      : o.lockedLine != null
                      ? ` (${o.pickType === "SPREAD" ? formatSpread(o.lockedLine) : o.lockedLine}${bookTag})`
                      : "";
                  const selectionDisplay =
                    o.selection === g.homeTeam
                      ? g.homeAbbr ?? o.selection
                      : o.selection === g.awayTeam
                      ? g.awayAbbr ?? o.selection
                      : o.selection;
                  return (
                    <div key={i} className="banner-note" style={{ marginTop: i === 0 ? 0 : "4px" }}>
                      {o.name} locked {o.pickType.toLowerCase()}: {selectionDisplay}
                      {num}
                    </div>
                  );
                })}
              </div>
            )}

            {!hasOdds && <p className="subtext" style={{ marginTop: "10px" }}>Odds not posted yet for this game.</p>}

            {hasOdds && g.snap && (
              <>
                <div className="divider" />

                {/* Spread */}
                {showSpread && (deadlinePassed || g.spread.locked ? (
                  g.spread.selection ? (
                    <div style={{ marginTop: "4px" }}>
                      <div className="row-between">
                        <span>
                          Spread:{" "}
                          {g.spread.selection === g.homeTeam
                            ? g.homeAbbr ?? g.spread.selection
                            : g.spread.selection === g.awayTeam
                            ? g.awayAbbr ?? g.spread.selection
                            : g.spread.selection}
                          {g.spread.lockedLine != null ? ` (${formatSpread(g.spread.lockedLine)}${g.spread.lockedOdds != null ? ` ${formatOdds(g.spread.lockedOdds)}` : ""}${g.spread.lockedBook ? `, ${bookLabel(g.spread.lockedBook)}` : ""})` : ""}
                          <ResultTag graded={g.spread.graded} isWin={g.spread.isWin} isPush={g.spread.isPush} />
                        </span>
                        {g.spread.locked ? (
                          <span className="locked-badge">
                            <span className="locked-dot" />
                            <span className="locked-text">LOCKED</span>
                          </span>
                        ) : (
                          <span className="miss-badge">NOT LOCKED</span>
                        )}
                      </div>
                      {!g.spread.locked && (
                        <p className="subtext" style={{ margin: "2px 0 0", color: "var(--down)" }}>
                          Never locked in &mdash; doesn&apos;t count.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="subtext" style={{ margin: "4px 0" }}>Spread: no pick made</p>
                  )
                ) : (
                  <>
                    <div className="pill-grid">
                      <button
                        type="button"
                        className={`pill-btn${spreadChoice[g.id] === "away" ? " selected" : ""}`}
                        onClick={() => pickSpread(g, "away")}
                      >
                        {g.yahn.spreadSide === "away" && <YahnMark edge={g.yahn.spreadEdge} />}
                        <div className="pill-label">
                          <TeamLogo src={g.awayLogo} alt={g.awayTeam} />
                          {g.awayAbbr ?? g.awayTeam}
                        </div>
                        <div className="pill-value">
                          {formatSpread(g.snap.spreadAway)}
                          <ValueMove delta={valueVsOpen("spread", g.snap.spreadAway, g.movement.openSpreadAway)} />
                        </div>
                        <JuiceAndOpen
                          juice={g.snap.spreadAwayPrice}
                          open={g.movement.openSpreadAway != null ? formatSpread(g.movement.openSpreadAway) : null}
                          moved={hasMoved(valueVsOpen("spread", g.snap.spreadAway, g.movement.openSpreadAway))}
                        />
                      </button>
                      <button
                        type="button"
                        className={`pill-btn${spreadChoice[g.id] === "home" ? " selected" : ""}`}
                        onClick={() => pickSpread(g, "home")}
                      >
                        {g.yahn.spreadSide === "home" && <YahnMark edge={g.yahn.spreadEdge} />}
                        <div className="pill-label">
                          <TeamLogo src={g.homeLogo} alt={g.homeTeam} />
                          {g.homeAbbr ?? g.homeTeam}
                        </div>
                        <div className="pill-value">
                          {formatSpread(g.snap.spreadHome)}
                          <ValueMove delta={valueVsOpen("spread", g.snap.spreadHome, g.movement.openSpreadHome)} />
                        </div>
                        <JuiceAndOpen
                          juice={g.snap.spreadHomePrice}
                          open={g.movement.openSpreadHome != null ? formatSpread(g.movement.openSpreadHome) : null}
                          moved={hasMoved(valueVsOpen("spread", g.snap.spreadHome, g.movement.openSpreadHome))}
                        />
                      </button>
                    </div>
                    {spreadChoice[g.id] && (
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        {isCurrentWeek ? (
                          <HoldToLock
                              onLock={async () => {
                              const finishing = beginLock("side");
                              const isHome = spreadChoice[g.id] === "home";
                              const value = isHome ? g.homeTeam : g.awayTeam;
                              const lockedLine = isHome ? g.snap?.spreadHome ?? null : g.snap?.spreadAway ?? null;
                              const lockedOdds = isHome
                                ? g.snap?.spreadHomePrice ?? null
                                : g.snap?.spreadAwayPrice ?? null;
                              const res = await lockValue(slug, g.id, "SPREAD", value, lockedLine, lockedOdds, null, g.snap?.sourceBook ?? null);
                              if (res.error) {
                                hapticError();
                                setError(res.error);
                              } else {
                                if (finishing) setCelebrating(true);
                                else hapticSuccess();
                                setError(null);
                              }
                              }}
                            />
                        ) : (
                          <span className="meta">Locking opens once this is the current week</span>
                        )}
                      </div>
                    )}
                  </>
                ))}

                {/* Total */}
                {showTotal && (deadlinePassed || g.total.locked ? (
                  g.total.selection ? (
                    <div style={{ marginTop: "4px" }}>
                      <div className="row-between">
                        <span>
                          Total: {g.total.selection}
                          {g.total.lockedLine != null ? ` (${g.total.lockedLine}${g.total.lockedOdds != null ? ` ${formatOdds(g.total.lockedOdds)}` : ""}${g.total.lockedBook ? `, ${bookLabel(g.total.lockedBook)}` : ""})` : ""}
                          <ResultTag graded={g.total.graded} isWin={g.total.isWin} isPush={g.total.isPush} />
                        </span>
                        {g.total.locked ? (
                          <span className="locked-badge">
                            <span className="locked-dot" />
                            <span className="locked-text">LOCKED</span>
                          </span>
                        ) : (
                          <span className="miss-badge">NOT LOCKED</span>
                        )}
                      </div>
                      {!g.total.locked && (
                        <p className="subtext" style={{ margin: "2px 0 0", color: "var(--down)" }}>
                          Never locked in &mdash; doesn&apos;t count.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="subtext" style={{ margin: "4px 0" }}>Total: no pick made</p>
                  )
                ) : (
                  <>
                    <div className="pill-grid">
                      <button
                        type="button"
                        className={`pill-btn${totalChoice[g.id] === "over" ? " selected" : ""}`}
                        onClick={() => pickTotal(g, "over")}
                      >
                        {g.yahn.totalSide === "over" && <YahnMark edge={g.yahn.totalEdge} />}
                        <div className="pill-label">Over</div>
                        <div className="pill-value">
                          {g.snap.total}
                          <ValueMove delta={valueVsOpen("over", g.snap.total, g.movement.openTotal)} />
                        </div>
                        <JuiceAndOpen
                          juice={g.snap.totalOverPrice}
                          open={g.movement.openTotal != null ? String(g.movement.openTotal) : null}
                          moved={hasMoved(valueVsOpen("over", g.snap.total, g.movement.openTotal))}
                        />
                      </button>
                      <button
                        type="button"
                        className={`pill-btn${totalChoice[g.id] === "under" ? " selected" : ""}`}
                        onClick={() => pickTotal(g, "under")}
                      >
                        {g.yahn.totalSide === "under" && <YahnMark edge={g.yahn.totalEdge} />}
                        <div className="pill-label">Under</div>
                        <div className="pill-value">
                          {g.snap.total}
                          <ValueMove delta={valueVsOpen("under", g.snap.total, g.movement.openTotal)} />
                        </div>
                        <JuiceAndOpen
                          juice={g.snap.totalUnderPrice}
                          open={g.movement.openTotal != null ? String(g.movement.openTotal) : null}
                          moved={hasMoved(valueVsOpen("under", g.snap.total, g.movement.openTotal))}
                        />
                      </button>
                    </div>
                    {totalChoice[g.id] && (
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        {isCurrentWeek ? (
                          <HoldToLock
                              onLock={async () => {
                              const finishing = beginLock("side");
                              const value = totalChoice[g.id];
                              if (!value) return;
                              const lockedLine = g.snap?.total ?? null;
                              const lockedOdds =
                                value === "over" ? g.snap?.totalOverPrice ?? null : g.snap?.totalUnderPrice ?? null;
                              const res = await lockValue(slug, g.id, "TOTAL", value, lockedLine, lockedOdds, null, g.snap?.sourceBook ?? null);
                              if (res.error) {
                                hapticError();
                                setError(res.error);
                              } else {
                                if (finishing) setCelebrating(true);
                                else hapticSuccess();
                                setError(null);
                              }
                              }}
                            />
                        ) : (
                          <span className="meta">Locking opens once this is the current week</span>
                        )}
                      </div>
                    )}
                  </>
                ))}

                {/* Dog */}
                {g.dog && (() => {
                  const dog = g.dog;
                  return (
                  <div className="pill-single">
                    {deadlinePassed || dog.locked ? (
                      dog.selection ? (
                        <div style={{ marginTop: "4px" }}>
                          <div className="row-between">
                            <span>
                              Dog:{" "}
                              {dog.selection === g.homeTeam
                                ? g.homeAbbr ?? dog.selection
                                : dog.selection === g.awayTeam
                                ? g.awayAbbr ?? dog.selection
                                : dog.selection}
                              {dog.dogSpreadValue != null ? ` (worth ${dog.dogSpreadValue} pts${dog.lockedOdds != null ? `, ${formatOdds(dog.lockedOdds)} ML` : ""}${dog.lockedBook ? `, ${bookLabel(dog.lockedBook)}` : ""})` : ""}
                              {dog.graded && (
                                <span
                                  className={dog.isWin ? "pick-win" : "pick-loss"}
                                  style={{ fontSize: "11px", fontWeight: 700, marginLeft: "6px" }}
                                >
                                  {dog.isWin ? `HIT +${dog.pointsEarned ?? 0} pts` : "MISS"}
                                </span>
                              )}
                            </span>
                            {dog.locked ? (
                              <span className="locked-badge">
                                <span className="locked-dot" />
                                <span className="locked-text">LOCKED</span>
                              </span>
                            ) : (
                              <span className="miss-badge">NOT LOCKED</span>
                            )}
                          </div>
                          {!dog.locked && (
                            <p className="subtext" style={{ margin: "2px 0 0", color: "var(--down)" }}>
                              Never locked in &mdash; doesn&apos;t count.
                            </p>
                          )}
                        </div>
                      ) : null
                    ) : hasLockedDog ? null : (
                      <>
                        <button
                          type="button"
                          className={`pill-btn${
                            dogChoice === `${g.id}|${g.snap?.underdogTeam}` ? " selected" : ""
                          }`}
                          onClick={() => pickDog(g)}
                        >
                          <div className="pill-label">Dog pick</div>
                          <div className="pill-value">
                            {g.snap?.underdogTeam === g.homeTeam
                              ? g.homeAbbr ?? g.snap?.underdogTeam
                              : g.awayAbbr ?? g.snap?.underdogTeam}
                          </div>
                          {(g.snap?.underdogTeam === g.homeTeam ? g.snap?.mlHome : g.snap?.mlAway) != null && (
                            <div className="pill-juice">
                              {formatOdds(g.snap?.underdogTeam === g.homeTeam ? g.snap?.mlHome : g.snap?.mlAway)} ML
                            </div>
                          )}
                        </button>
                        {dogChoice === `${g.id}|${g.snap?.underdogTeam}` && (
                          <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "8px" }}>
                            {isCurrentWeek ? (
                              <HoldToLock
                                  onLock={async () => {
                                  const finishing = beginLock("dog");
                                  if (!g.snap?.underdogTeam) return;
                                  const isHome = g.snap.underdogTeam === g.homeTeam;
                                  const dogSpreadValue = Math.abs(
                                    (isHome ? g.snap.spreadHome : g.snap.spreadAway) ?? 0
                                  );
                                  const lockedOdds = isHome ? g.snap.mlHome ?? null : g.snap.mlAway ?? null;
                                  const res = await lockValue(
                                    slug,
                                    g.id,
                                    "DOG",
                                    g.snap.underdogTeam,
                                    null,
                                    lockedOdds,
                                    dogSpreadValue,
                                    g.snap.sourceBook
                                  );
                                  if (res.error) {
                                    hapticError();
                                    setError(res.error);
                                  } else {
                                    if (finishing) setCelebrating(true);
                                    else hapticSuccess();
                                    setError(null);
                                  }
                                  }}
                                />
                            ) : (
                              <span className="meta">Locking opens once this is the current week</span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  );
                })()}
              </>
            )}

            {g.snap && (
              <div className="meta" style={{ marginTop: "8px" }}>
                {g.snap.sourceBook ? `odds via ${bookLabel(g.snap.sourceBook)} · ` : ""}
                line as of {g.snap.capturedAtDisplay}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
