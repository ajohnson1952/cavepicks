"use client";

import { useEffect, useMemo } from "react";

// "Fully locked in" celebration: shown the moment a player's lock completes
// all 5 side picks + the dog pick for the week. Bills rain down over a
// center card, then it all fades on its own (or on tap). The triple-tick
// haptic is fired by the caller, on the Lock In tap itself - iOS drops
// haptics fired this long after a tap.
const BILLS = 44;
const AUTO_CLOSE_MS = 4200;

export default function MoneyShower({ onDone }: { onDone: () => void }) {
  // Random layout computed once per show - left position, fall time, delay,
  // spin, sway, size. Mostly bills, a few bags.
  const bills = useMemo(
    () =>
      Array.from({ length: BILLS }).map((_, i) => ({
        left: Math.random() * 100,
        duration: 2.2 + Math.random() * 1.6,
        delay: Math.random() * 1.1,
        spin: (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 360),
        sway: (Math.random() - 0.5) * 120,
        size: 22 + Math.random() * 18,
        glyph: i % 7 === 0 ? "💰" : "💵",
      })),
    []
  );

  useEffect(() => {
    const id = setTimeout(onDone, AUTO_CLOSE_MS);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div className="money-shower" data-no-ptr onClick={onDone} role="dialog" aria-label="Locked in">
      {bills.map((b, i) => (
        <span
          key={i}
          className="money-bill"
          style={
            {
              left: `${b.left}%`,
              fontSize: `${b.size}px`,
              animationDuration: `${b.duration}s`,
              animationDelay: `${b.delay}s`,
              "--spin": `${b.spin}deg`,
              "--sway": `${b.sway}px`,
            } as React.CSSProperties
          }
        >
          {b.glyph}
        </span>
      ))}
      <div className="money-card">
        <img src="/icon-192.png" alt="" width={72} height={72} style={{ borderRadius: "18px" }} />
        <div className="money-title">LOCKED IN</div>
        <div className="money-sub">5 picks + dog. Good luck, caveman.</div>
      </div>
    </div>
  );
}
