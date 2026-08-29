"use client";

import { useEffect, useState } from "react";
import { lockPick, unlockPick, clearPick, lockSelection, autosaveSelection } from "./actions";

type Snap = {
  spreadHome: number | null;
  spreadAway: number | null;
  total: number | null;
  underdogTeam: string | null;
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
  kickoffDisplay: string;
  autoLockDisplay: string;
  pastAutoLock: boolean;
  snap: Snap | null;
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

  // Re-sync local selection state whenever fresh server data arrives
  // (after a Lock/Unlock/Clear round trip revalidates the page).
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

  function clearSpreadLocal(g: GameView) {
    setSpreadChoice((s) => ({ ...s, [g.id]: undefined }));
  }
  function clearTotalLocal(g: GameView) {
    setTotalChoice((s) => ({ ...s, [g.id]: undefined }));
  }
  function clearDogLocal() {
    setDogChoice(undefined);
  }

  return (
    <div>
      {error && (
        <p style={{ color: "#b00020", fontWeight: "bold", border: "1px solid #b00020", padding: "0.5rem" }}>
          {error}
        </p>
      )}

      {games.length === 0 && <p>No games in this week&apos;s slate yet.</p>}

      <form>
        {games.map((g) => {
          const gameFullyLocked = g.pastAutoLock;

          return (
            <div key={g.id} style={{ border: "1px solid #ddd", padding: "0.75rem", marginBottom: "0.75rem" }}>
              <strong>
                {g.awayTeam} @ {g.homeTeam}
              </strong>
              <div style={{ fontSize: "0.85em", color: "#444" }}>Kickoff: {g.kickoffDisplay}</div>
              <div style={{ fontSize: "0.85em", color: "#666" }}>
                Auto-locks {g.autoLockDisplay} if you haven&apos;t locked it yourself
              </div>

              {g.lockedByOthers.length > 0 && (
                <div style={{ fontSize: "0.8em", color: "#8a5a00", marginTop: "0.25rem" }}>
                  🔒 Already locked by:{" "}
                  {g.lockedByOthers
                    .map((o) => `${o.name} (${o.pickType.toLowerCase()}: ${o.selection})`)
                    .join(", ")}
                </div>
              )}

              {!g.snap && <p>Odds not posted yet for this game.</p>}

              {g.snap && (
                <>
                  {/* Spread */}
                  <div style={{ marginTop: "0.5rem" }}>
                    {gameFullyLocked || g.spread.locked ? (
                      <div>
                        <strong>Spread locked:</strong> {g.spread.selection ?? "no pick made"}
                        {g.spread.lockedLine != null ? ` (${g.spread.lockedLine})` : ""}
                        {!gameFullyLocked && g.spread.pickId && (
                          <>
                            {" "}
                            <button formAction={unlockPick.bind(null, slug, g.spread.pickId)}>
                              Unlock
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <>
                        <div>
                          <label>
                            <input
                              type="radio"
                              name={`spread_${g.id}`}
                              value="away"
                              checked={spreadChoice[g.id] === "away"}
                              onChange={() => pickSpread(g, "away")}
                            />{" "}
                            {g.awayTeam} {g.snap.spreadAway != null && g.snap.spreadAway > 0 ? "+" : ""}
                            {g.snap.spreadAway}
                          </label>
                          <br />
                          <label>
                            <input
                              type="radio"
                              name={`spread_${g.id}`}
                              value="home"
                              checked={spreadChoice[g.id] === "home"}
                              onChange={() => pickSpread(g, "home")}
                            />{" "}
                            {g.homeTeam} {g.snap.spreadHome != null && g.snap.spreadHome > 0 ? "+" : ""}
                            {g.snap.spreadHome}
                          </label>
                        </div>
                        {spreadChoice[g.id] && (
                          <div style={{ marginTop: "0.25rem" }}>
                            <button formAction={lockSelection.bind(null, slug, g.id, "SPREAD")}>
                              🔒 Lock In
                            </button>{" "}
                            <button
                              type="button"
                              onClick={() => {
                                clearSpreadLocal(g);
                                if (g.spread.pickId) clearPick(slug, g.id, "SPREAD");
                              }}
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Total */}
                  <div style={{ marginTop: "0.5rem" }}>
                    {gameFullyLocked || g.total.locked ? (
                      <div>
                        <strong>Total locked:</strong> {g.total.selection ?? "no pick made"}
                        {g.total.lockedLine != null ? ` (${g.total.lockedLine})` : ""}
                        {!gameFullyLocked && g.total.pickId && (
                          <>
                            {" "}
                            <button formAction={unlockPick.bind(null, slug, g.total.pickId)}>
                              Unlock
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <>
                        <div>
                          <label>
                            <input
                              type="radio"
                              name={`total_${g.id}`}
                              value="over"
                              checked={totalChoice[g.id] === "over"}
                              onChange={() => pickTotal(g, "over")}
                            />{" "}
                            Over {g.snap.total}
                          </label>
                          <br />
                          <label>
                            <input
                              type="radio"
                              name={`total_${g.id}`}
                              value="under"
                              checked={totalChoice[g.id] === "under"}
                              onChange={() => pickTotal(g, "under")}
                            />{" "}
                            Under {g.snap.total}
                          </label>
                        </div>
                        {totalChoice[g.id] && (
                          <div style={{ marginTop: "0.25rem" }}>
                            <button formAction={lockSelection.bind(null, slug, g.id, "TOTAL")}>
                              🔒 Lock In
                            </button>{" "}
                            <button
                              type="button"
                              onClick={() => {
                                clearTotalLocal(g);
                                if (g.total.pickId) clearPick(slug, g.id, "TOTAL");
                              }}
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Dog */}
                  {g.dog && (
                    <div style={{ marginTop: "0.5rem" }}>
                      {gameFullyLocked || g.dog.locked ? (
                        g.dog.selection ? (
                          <div>
                            <strong>Dog pick locked:</strong> {g.dog.selection}
                            {g.dog.dogSpreadValue != null
                              ? ` (worth ${g.dog.dogSpreadValue} pts if it hits)`
                              : ""}
                            {!gameFullyLocked && g.dog.pickId && (
                              <>
                                {" "}
                                <button formAction={unlockPick.bind(null, slug, g.dog.pickId)}>
                                  Unlock
                                </button>
                              </>
                            )}
                          </div>
                        ) : null
                      ) : hasLockedDog ? null : (
                        <>
                          <div>
                            <label>
                              <input
                                type="radio"
                                name="dogPick"
                                value={`${g.id}|${g.snap.underdogTeam}`}
                                checked={dogChoice === `${g.id}|${g.snap.underdogTeam}`}
                                onChange={() => pickDog(g)}
                              />{" "}
                              Make {g.snap.underdogTeam} my dog pick
                            </label>
                          </div>
                          {dogChoice === `${g.id}|${g.snap.underdogTeam}` && (
                            <div style={{ marginTop: "0.25rem" }}>
                              <button formAction={lockSelection.bind(null, slug, g.id, "DOG")}>
                                🔒 Lock In
                              </button>{" "}
                              <button
                                type="button"
                                onClick={() => {
                                  clearDogLocal();
                                  if (g.dog?.pickId) clearPick(slug, g.id, "DOG");
                                }}
                              >
                                Clear
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </form>
    </div>
  );
}
