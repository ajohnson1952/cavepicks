"use client";
// /lab only: a button to preview the joke pop-up (app/RateUsJoke.tsx) on
// demand, without using up one of your two real ambushes on the Board.
import { useState } from "react";
import { RateUsPopup } from "../RateUsJoke";

export default function RateUsMock() {
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <div className="matchup">⭐ The fake &ldquo;rate us&rdquo; pop-up</div>
      <p className="subtext" style={{ margin: "4px 0 10px" }}>
        The joke review prompt. Tap any star and all five fill in. &ldquo;Not now&rdquo; jumps away four
        times before it gives in. It ambushes each phone twice on the Board; this button is just for a preview.
      </p>
      <button type="button" className="btn btn-lock" onClick={() => setOpen(true)}>
        Show the pop-up
      </button>
      {open && <RateUsPopup onClose={() => setOpen(false)} />}
    </div>
  );
}
