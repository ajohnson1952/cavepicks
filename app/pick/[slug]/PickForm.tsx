"use client";

import { useFormState } from "react-dom";
import { submitPicks } from "./actions";

type Snap = {
  spreadHome: number | null;
  spreadAway: number | null;
  total: number | null;
  underdogTeam: string | null;
};

type OpenGame = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  lockAtDisplay: string;
  snap: Snap | null;
  existingSpread?: string;
  existingTotal?: string;
  existingDog?: string;
};

export default function PickForm({
  slug,
  openGames,
  hasLockedDog,
}: {
  slug: string;
  openGames: OpenGame[];
  hasLockedDog: boolean;
}) {
  const action = submitPicks.bind(null, slug);
  const [state, formAction] = useFormState(action, { error: null });

  return (
    <form action={formAction}>
      <h2>Open games</h2>
      {state.error && (
        <p style={{ color: "#b00020", fontWeight: "bold", border: "1px solid #b00020", padding: "0.5rem" }}>
          {state.error}
        </p>
      )}
      {openGames.length === 0 && <p>No open games right now.</p>}
      {openGames.map((g) => (
        <div key={g.id} style={{ border: "1px solid #ddd", padding: "0.75rem", marginBottom: "0.75rem" }}>
          <strong>
            {g.awayTeam} @ {g.homeTeam}
          </strong>
          <div style={{ fontSize: "0.85em", color: "#666" }}>
            Locks {g.lockAtDisplay} &middot; line shown is informational, not final until lock
          </div>

          {g.snap ? (
            <>
              <div style={{ marginTop: "0.5rem" }}>
                <label>
                  <input
                    type="radio"
                    name={`spread_${g.id}`}
                    value="away"
                    defaultChecked={g.existingSpread === g.awayTeam}
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
                    defaultChecked={g.existingSpread === g.homeTeam}
                  />{" "}
                  {g.homeTeam} {g.snap.spreadHome != null && g.snap.spreadHome > 0 ? "+" : ""}
                  {g.snap.spreadHome}
                </label>
              </div>

              <div style={{ marginTop: "0.5rem" }}>
                <label>
                  <input
                    type="radio"
                    name={`total_${g.id}`}
                    value="over"
                    defaultChecked={g.existingTotal === "over"}
                  />{" "}
                  Over {g.snap.total}
                </label>
                <br />
                <label>
                  <input
                    type="radio"
                    name={`total_${g.id}`}
                    value="under"
                    defaultChecked={g.existingTotal === "under"}
                  />{" "}
                  Under {g.snap.total}
                </label>
              </div>

              {g.snap.underdogTeam && !hasLockedDog && (
                <div style={{ marginTop: "0.5rem" }}>
                  <label>
                    <input
                      type="radio"
                      name="dogPick"
                      value={`${g.id}|${g.snap.underdogTeam}`}
                      defaultChecked={g.existingDog === g.snap.underdogTeam}
                    />{" "}
                    Make {g.snap.underdogTeam} my dog pick
                  </label>
                </div>
              )}
            </>
          ) : (
            <p>Odds not posted yet for this game.</p>
          )}
        </div>
      ))}

      <button type="submit">Save picks</button>
    </form>
  );
}
