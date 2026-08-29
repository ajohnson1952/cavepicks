"use client";

import { useFormState } from "react-dom";
import { submitPicks, lockPick, unlockPick, clearPick } from "./actions";

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
  autoLockDisplay: string;
  pastAutoLock: boolean;
  snap: Snap | null;
  spread: PickSlot;
  total: PickSlot;
  dog: DogSlot | null;
  lockedByOthers: LockedByOther[];
};

export default function PickForm({
  slug,
  games,
  hasLockedDog,
}: {
  slug: string;
  games: GameView[];
  hasLockedDog: boolean;
}) {
  const submitAction = submitPicks.bind(null, slug);
  const [state, formAction] = useFormState(submitAction, { error: null });

  return (
    <form action={formAction}>
      {state.error && (
        <p style={{ color: "#b00020", fontWeight: "bold", border: "1px solid #b00020", padding: "0.5rem" }}>
          {state.error}
        </p>
      )}

      {games.length === 0 && <p>No games in this week&apos;s slate yet.</p>}

      {games.map((g) => {
        const gameFullyLocked = g.pastAutoLock; // safety net even if the sweep hasn't run yet

        return (
          <div key={g.id} style={{ border: "1px solid #ddd", padding: "0.75rem", marginBottom: "0.75rem" }}>
            <strong>
              {g.awayTeam} @ {g.homeTeam}
            </strong>
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
                          <button formAction={unlockPick.bind(null, slug, g.spread.pickId)}>Unlock</button>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      <div key={`spread-${g.id}-${g.spread.selection ?? "none"}`}>
                        <label>
                          <input
                            type="radio"
                            name={`spread_${g.id}`}
                            value="away"
                            defaultChecked={g.spread.selection === g.awayTeam}
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
                            defaultChecked={g.spread.selection === g.homeTeam}
                          />{" "}
                          {g.homeTeam} {g.snap.spreadHome != null && g.snap.spreadHome > 0 ? "+" : ""}
                          {g.snap.spreadHome}
                        </label>
                      </div>
                      {g.spread.pickId && (
                        <div>
                          <button formAction={lockPick.bind(null, slug, g.spread.pickId)}>
                            Lock In spread pick
                          </button>{" "}
                          <button formAction={clearPick.bind(null, slug, g.id, "SPREAD")}>Clear</button>
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
                          <button formAction={unlockPick.bind(null, slug, g.total.pickId)}>Unlock</button>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      <div key={`total-${g.id}-${g.total.selection ?? "none"}`}>
                        <label>
                          <input
                            type="radio"
                            name={`total_${g.id}`}
                            value="over"
                            defaultChecked={g.total.selection === "over"}
                          />{" "}
                          Over {g.snap.total}
                        </label>
                        <br />
                        <label>
                          <input
                            type="radio"
                            name={`total_${g.id}`}
                            value="under"
                            defaultChecked={g.total.selection === "under"}
                          />{" "}
                          Under {g.snap.total}
                        </label>
                      </div>
                      {g.total.pickId && (
                        <div>
                          <button formAction={lockPick.bind(null, slug, g.total.pickId)}>
                            Lock In total pick
                          </button>{" "}
                          <button formAction={clearPick.bind(null, slug, g.id, "TOTAL")}>Clear</button>
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
                          {g.dog.dogSpreadValue != null ? ` (worth ${g.dog.dogSpreadValue} pts if it hits)` : ""}
                          {!gameFullyLocked && g.dog.pickId && (
                            <>
                              {" "}
                              <button formAction={unlockPick.bind(null, slug, g.dog.pickId)}>Unlock</button>
                            </>
                          )}
                        </div>
                      ) : null
                    ) : hasLockedDog ? null : (
                      <>
                        <div key={`dog-${g.id}-${g.dog.selection ?? "none"}`}>
                          <label>
                            <input
                              type="radio"
                              name="dogPick"
                              value={`${g.id}|${g.snap.underdogTeam}`}
                              defaultChecked={g.dog.selection === g.snap.underdogTeam}
                            />{" "}
                            Make {g.snap.underdogTeam} my dog pick
                          </label>
                        </div>
                        {g.dog.pickId && (
                          <div>
                            <button formAction={lockPick.bind(null, slug, g.dog.pickId)}>
                              Lock In dog pick
                            </button>{" "}
                            <button formAction={clearPick.bind(null, slug, g.id, "DOG")}>Clear</button>
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

      <button type="submit">Save picks</button>
    </form>
  );
}
