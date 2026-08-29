"use client";

import { useEffect, useState } from "react";
import { unlockPick, clearPick, lockValue, autosaveSelection } from "./actions";

type Snap = {
  spreadHome: number | null;
  spreadAway: number | null;
  total: number | null;
  underdogTeam: string | null;
};

type Movement = {
  spreadHome: number | null;
  spreadAway: number | null;
  total: number | null;
};

type PickSlot = {
  pickId: string | null;
  selection: string | null;
  locked: boolean;
  lockedLine: number | null;
};

type DogSlot = {
  pickId: string | null;
  selection: string | null;
  locked: boolean;
  dogSpreadValue: number | null;
};

type LockedByOther = { name: string; pickType: string; selection: string };

type GameView = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string | null;
  awayAbbr: string | null;
  homeLogo: string | null;
  awayLogo: string | null;
  kickoffDisplay: string;
  autoLockDisplay: string;
  pastAutoLock: boolean;
  snap: Snap | null;
  movement: Movement;
  spread: PickSlot;
  total: PickSlot;
  dog: DogSlot | null;
  lockedByOthers: LockedByOther[];
};

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

function MoveIndicator({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) return null;
  return delta > 0 ? (
    <span className="move-up">&#9650;{Math.abs(delta)}</span>
  ) : (
    <span className="move-down">&#9660;{Math.abs(delta)}</span>
  );
}

export default function PickForm({
  slug,
  games,
  hasLockedDog,
}: {
  slug: string;
  games: GameView[];
  hasLockedDog: boolean;
}) {
  const [spreadChoice, setSpreadChoice] = useState<Record<string, "home" | "away" | undefined>>(
    () => computeInitialState(games).spread
  );
  const [totalChoice, setTotalChoice] = useState<Record<string, "over" | "under" | undefined>>(
    () => computeInitialState(games).total
  );
  const [dogChoice, setDogChoice] = useState<string | undefined>(() => computeInitialState(games).dog);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = computeInitialState(games);
    setSpreadChoice(init.spread);
    setTotalChoice(init.total);
    setDogChoice(init.dog);
  }, [games]);

  async function pickSpread(g: GameView, value: "home" | "away") {
    const prev = spreadChoice[g.id];
    setSpreadChoice((s) => ({ ...s, [g.id]: value }));
    const res = await autosaveSelection(slug, g.id, "SPREAD", value === "home" ? g.homeTeam : g.awayTeam);
    if (res.error) {
      setError(res.error);
      setSpreadChoice((s) => ({ ...s, [g.id]: prev }));
    } else {
      setError(null);
    }
  }

  async function pickTotal(g: GameView, value: "over" | "under") {
    const prev = totalChoice[g.id];
    setTotalChoice((s) => ({ ...s, [g.id]: value }));
    const res = await autosaveSelection(slug, g.id, "TOTAL", value);
    if (res.error) {
      setError(res.error);
      setTotalChoice((s) => ({ ...s, [g.id]: prev }));
    } else {
      setError(null);
    }
  }

  async function pickDog(g: GameView) {
    if (!g.snap?.underdogTeam) return;
    const prev = dogChoice;
    setDogChoice(`${g.id}|${g.snap.underdogTeam}`);
    const res = await autosaveSelection(slug, g.id, "DOG", g.snap.underdogTeam);
    if (res.error) {
      setError(res.error);
      setDogChoice(prev);
    } else {
      setError(null);
    }
  }

  return (
    <div>
      {error && <div className="banner-error">{error}</div>}

      {games.length === 0 && <p className="subtext">No games in this week&apos;s slate yet.</p>}

      {games.map((g) => {
        const gameFullyLocked = g.pastAutoLock;

        return (
          <div key={g.id} className="card">
            <div className="row-between">
              <div className="matchup">
                <TeamLogo src={g.awayLogo} alt={g.awayTeam} />
                {g.awayAbbr ?? g.awayTeam} @ <TeamLogo src={g.homeLogo} alt={g.homeTeam} />
                {g.homeAbbr ?? g.homeTeam}
              </div>
              <div className="meta">{g.kickoffDisplay}</div>
            </div>
            <div className="meta" style={{ marginTop: "2px" }}>
              Auto-locks {g.autoLockDisplay}
            </div>

            {g.lockedByOthers.length > 0 && (
              <div className="banner-note">
                Locked by:{" "}
                {g.lockedByOthers
                  .map((o) => `${o.name} (${o.pickType.toLowerCase()}: ${o.selection})`)
                  .join(", ")}
              </div>
            )}

            {!g.snap && <p className="subtext" style={{ marginTop: "10px" }}>Odds not posted yet.</p>}

            {g.snap && (
              <>
                <div className="divider" />

                {/* Spread */}
                {gameFullyLocked || g.spread.locked ? (
                  <div className="locked-detail">
                    <span className="locked-badge">
                      <span className="locked-dot" />
                      <span className="locked-text">LOCKED</span>
                    </span>{" "}
                    Spread: {g.spread.selection === g.homeTeam ? g.homeAbbr ?? g.spread.selection : g.spread.selection === g.awayTeam ? g.awayAbbr ?? g.spread.selection : g.spread.selection ?? "no pick"}
                    {g.spread.lockedLine != null ? ` (${g.spread.lockedLine})` : ""}
                    {!gameFullyLocked && g.spread.pickId && (
                      <button className="btn btn-ghost" onClick={() => unlockPick(slug, g.spread.pickId!)}>
                        unlock
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="pill-grid">
                      <button
                        type="button"
                        className={`pill-btn${spreadChoice[g.id] === "away" ? " selected" : ""}`}
                        onClick={() => pickSpread(g, "away")}
                      >
                        <div className="pill-label">
                          <TeamLogo src={g.awayLogo} alt={g.awayTeam} />
                          {g.awayAbbr ?? g.awayTeam}
                        </div>
                        <div className="pill-value">
                          {g.snap.spreadAway != null && g.snap.spreadAway > 0 ? "+" : ""}
                          {g.snap.spreadAway}
                          <MoveIndicator delta={g.movement.spreadAway} />
                        </div>
                      </button>
                      <button
                        type="button"
                        className={`pill-btn${spreadChoice[g.id] === "home" ? " selected" : ""}`}
                        onClick={() => pickSpread(g, "home")}
                      >
                        <div className="pill-label">
                          <TeamLogo src={g.homeLogo} alt={g.homeTeam} />
                          {g.homeAbbr ?? g.homeTeam}
                        </div>
                        <div className="pill-value">
                          {g.snap.spreadHome != null && g.snap.spreadHome > 0 ? "+" : ""}
                          {g.snap.spreadHome}
                          <MoveIndicator delta={g.movement.spreadHome} />
                        </div>
                      </button>
                    </div>
                    {spreadChoice[g.id] && (
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <button
                          className="btn btn-lock"
                          style={{ width: "auto", flex: 1 }}
                          onClick={async () => {
                            const value = spreadChoice[g.id] === "home" ? g.homeTeam : g.awayTeam;
                            const res = await lockValue(slug, g.id, "SPREAD", value);
                            if (res.error) setError(res.error);
                            else setError(null);
                          }}
                        >
                          Lock in
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => {
                            setSpreadChoice((s) => ({ ...s, [g.id]: undefined }));
                            if (g.spread.pickId) clearPick(slug, g.id, "SPREAD");
                          }}
                        >
                          clear
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Total */}
                {gameFullyLocked || g.total.locked ? (
                  <div className="locked-detail">
                    <span className="locked-badge">
                      <span className="locked-dot" />
                      <span className="locked-text">LOCKED</span>
                    </span>{" "}
                    Total: {g.total.selection ?? "no pick"}
                    {g.total.lockedLine != null ? ` (${g.total.lockedLine})` : ""}
                    {!gameFullyLocked && g.total.pickId && (
                      <button className="btn btn-ghost" onClick={() => unlockPick(slug, g.total.pickId!)}>
                        unlock
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="pill-grid">
                      <button
                        type="button"
                        className={`pill-btn${totalChoice[g.id] === "over" ? " selected" : ""}`}
                        onClick={() => pickTotal(g, "over")}
                      >
                        <div className="pill-label">Over</div>
                        <div className="pill-value">
                          {g.snap.total}
                          <MoveIndicator delta={g.movement.total} />
                        </div>
                      </button>
                      <button
                        type="button"
                        className={`pill-btn${totalChoice[g.id] === "under" ? " selected" : ""}`}
                        onClick={() => pickTotal(g, "under")}
                      >
                        <div className="pill-label">Under</div>
                        <div className="pill-value">
                          {g.snap.total}
                          <MoveIndicator delta={g.movement.total !== null ? -g.movement.total : null} />
                        </div>
                      </button>
                    </div>
                    {totalChoice[g.id] && (
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <button
                          className="btn btn-lock"
                          style={{ width: "auto", flex: 1 }}
                          onClick={async () => {
                            const value = totalChoice[g.id];
                            if (!value) return;
                            const res = await lockValue(slug, g.id, "TOTAL", value);
                            if (res.error) setError(res.error);
                            else setError(null);
                          }}
                        >
                          Lock in
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => {
                            setTotalChoice((s) => ({ ...s, [g.id]: undefined }));
                            if (g.total.pickId) clearPick(slug, g.id, "TOTAL");
                          }}
                        >
                          clear
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Dog */}
                {g.dog && (() => {
                  const dog = g.dog;
                  return (
                  <div className="pill-single">
                    {gameFullyLocked || dog.locked ? (
                      dog.selection ? (
                        <div className="locked-detail">
                          <span className="locked-badge">
                            <span className="locked-dot" />
                            <span className="locked-text">LOCKED</span>
                          </span>{" "}
                          Dog: {dog.selection === g.homeTeam ? g.homeAbbr ?? dog.selection : dog.selection === g.awayTeam ? g.awayAbbr ?? dog.selection : dog.selection}
                          {dog.dogSpreadValue != null ? ` (worth ${dog.dogSpreadValue} pts)` : ""}
                          {!gameFullyLocked && dog.pickId && (
                            <button className="btn btn-ghost" onClick={() => unlockPick(slug, dog.pickId!)}>
                              unlock
                            </button>
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
                        </button>
                        {dogChoice === `${g.id}|${g.snap?.underdogTeam}` && (
                          <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "8px" }}>
                            <button
                              className="btn btn-lock"
                              style={{ width: "auto", flex: 1 }}
                              onClick={async () => {
                                if (!g.snap?.underdogTeam) return;
                                const res = await lockValue(slug, g.id, "DOG", g.snap.underdogTeam);
                                if (res.error) setError(res.error);
                                else setError(null);
                              }}
                            >
                              Lock in
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => {
                                setDogChoice(undefined);
                                if (g.dog?.pickId) clearPick(slug, g.id, "DOG");
                              }}
                            >
                              clear
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  );
                })()}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
