"use client";

import { useEffect, useRef, useState } from "react";
import { hapticTap } from "@/lib/haptics";

// "Hold to lock" - locks are final, so this replaces a plain tap (which a
// scroll or stray thumb could trigger) with a deliberate press: hold until
// the meter fills, then release to lock. Letting go early, or moving the
// finger (scrolling), cancels.
//
// Haptics: built like HapticButton (app/HapticButton.tsx) - an invisible
// iOS switch under the finger, the only way a web page can tick an iPhone.
// iOS ticks when the finger lifts, so the lock (and its tick) happens on
// RELEASE after the meter is full. Android gets an extra buzz the moment
// the meter fills (navigator.vibrate works there).
//
// Fallback: if iOS ever doesn't deliver the switch's change event after a
// long press, onLock still runs from the pointer-up (just without a tick) -
// a full hold must never silently do nothing.

const HOLD_MS = 550;
const MOVE_SLOP = 10;

export default function HoldToLock({ onLock, label = "Lock in" }: { onLock: () => void; label?: string }) {
  const [phase, setPhase] = useState<"idle" | "holding" | "armed">("idle");
  const g = useRef({
    x: 0,
    y: 0,
    timer: 0 as unknown as ReturnType<typeof setTimeout>,
    armed: false,
    pointerActive: false,
    firedFromChange: false,
    lastPointerAt: 0,
  });

  useEffect(() => () => clearTimeout(g.current.timer), []);

  const reset = () => {
    clearTimeout(g.current.timer);
    g.current.armed = false;
    setPhase("idle");
  };

  const fire = () => {
    g.current.armed = false;
    setPhase("idle");
    onLock();
  };

  return (
    <label
      className={`haptic-toggle btn btn-lock hold-lock${phase !== "idle" ? ` hold-${phase}` : ""}`}
      style={{ ["--hold-ms" as string]: `${HOLD_MS}ms`, width: "auto", flex: 1 }}
      onPointerDown={(e) => {
        g.current.lastPointerAt = Date.now();
        g.current.x = e.clientX;
        g.current.y = e.clientY;
        g.current.armed = false;
        g.current.pointerActive = true;
        g.current.firedFromChange = false;
        setPhase("holding");
        clearTimeout(g.current.timer);
        g.current.timer = setTimeout(() => {
          g.current.armed = true;
          setPhase("armed");
          hapticTap(); // Android buzz at full; no-op on iOS (tick comes on release)
        }, HOLD_MS);
      }}
      onPointerMove={(e) => {
        if (!g.current.pointerActive) return;
        if (Math.abs(e.clientX - g.current.x) > MOVE_SLOP || Math.abs(e.clientY - g.current.y) > MOVE_SLOP) {
          g.current.pointerActive = false;
          reset();
        }
      }}
      onPointerUp={() => {
        g.current.lastPointerAt = Date.now();
        if (!g.current.pointerActive) return;
        g.current.pointerActive = false;
        clearTimeout(g.current.timer);
        if (!g.current.armed) {
          reset();
          return;
        }
        // Normally the switch's change event (right after this) fires the
        // lock and iOS ticks. If it doesn't arrive, lock anyway.
        setTimeout(() => {
          if (g.current.armed && !g.current.firedFromChange) fire();
        }, 200);
      }}
      onPointerCancel={() => {
        g.current.pointerActive = false;
        reset();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="hold-fill" aria-hidden="true" />
      <span className="hold-text">{phase === "armed" ? "Release to lock 🔒" : phase === "holding" ? "Keep holding…" : `Hold to ${label.toLowerCase()}`}</span>
      <input
        type="checkbox"
        {...{ switch: "" }}
        className="haptic-input"
        checked={false}
        aria-label={`${label} (press and hold)`}
        onChange={() => {
          if (g.current.armed) {
            g.current.firedFromChange = true;
            fire();
          } else if (!g.current.pointerActive && Date.now() - g.current.lastPointerAt > 600) {
            // Not from a finger/mouse at all - keyboard (space on the focused
            // switch). There's no way to "hold" there, so lock directly.
            onLock();
          }
          // Otherwise: an early release or a scroll - ignore.
        }}
      />
    </label>
  );
}
