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
// long press, onLock still runs from the touch-end (just without a tick) -
// a full hold must never silently do nothing.

// Must stay UNDER iOS's long-press cutoff (~0.5s): hold a finger down past
// it and iOS cancels the tap, so the switch never toggles and never ticks
// (the lock still happens via the pointer-up fallback, just silently).
// 0.55s was too long on a real iPhone. /lab has a picker to test lengths.
export const DEFAULT_HOLD_MS = 350;
const MOVE_SLOP = 10;

export default function HoldToLock({
  onLock,
  label = "Lock in",
  holdMs = DEFAULT_HOLD_MS,
  onDebug,
}: {
  onLock: () => void;
  label?: string;
  holdMs?: number;
  /** /lab only: reports whether a lock came through the switch (iOS ticked) or the silent fallback */
  onDebug?: (source: "switch" | "fallback" | "early") => void;
}) {
  const [phase, setPhase] = useState<"idle" | "holding" | "armed">("idle");
  const g = useRef({
    x: 0,
    y: 0,
    timer: 0 as unknown as ReturnType<typeof setTimeout>,
    armed: false,
    active: false,
    firedFromChange: false,
    lastTouchAt: 0,
  });

  useEffect(() => () => clearTimeout(g.current.timer), []);

  const reset = () => {
    clearTimeout(g.current.timer);
    g.current.armed = false;
    g.current.active = false;
    setPhase("idle");
  };

  const fire = () => {
    g.current.armed = false;
    setPhase("idle");
    onLock();
  };

  // Touch events, not pointer events: iOS doesn't deliver pointer events to
  // the switch under the finger (the first version used them - the meter
  // never filled and the lock fired on any tap). Mouse handlers are for
  // desktop and skip the compatibility mouse events iOS sends after a touch.
  const start = (x: number, y: number) => {
    g.current = { ...g.current, x, y, armed: false, active: true, firedFromChange: false };
    setPhase("holding");
    clearTimeout(g.current.timer);
    g.current.timer = setTimeout(() => {
      g.current.armed = true;
      setPhase("armed");
      hapticTap(); // Android buzz at full; no-op on iOS (tick comes on release)
    }, holdMs);
  };
  const move = (x: number, y: number) => {
    if (!g.current.active) return;
    if (Math.abs(x - g.current.x) > MOVE_SLOP || Math.abs(y - g.current.y) > MOVE_SLOP) reset();
  };
  const end = () => {
    if (!g.current.active) return;
    g.current.active = false;
    clearTimeout(g.current.timer);
    if (!g.current.armed) {
      onDebug?.("early");
      reset();
      return;
    }
    // Normally the switch's change event (right after this) fires the lock
    // and iOS ticks. If it doesn't arrive, lock anyway (silently).
    setTimeout(() => {
      if (g.current.armed && !g.current.firedFromChange) {
        onDebug?.("fallback");
        fire();
      }
    }, 250);
  };
  const fromMouse = () => Date.now() - g.current.lastTouchAt > 1000;

  return (
    <label
      className={`haptic-toggle btn btn-lock hold-lock${phase !== "idle" ? ` hold-${phase}` : ""}`}
      style={{ ["--hold-ms" as string]: `${holdMs}ms`, width: "auto", flex: 1 }}
      onTouchStart={(e) => {
        g.current.lastTouchAt = Date.now();
        start(e.touches[0].clientX, e.touches[0].clientY);
      }}
      onTouchMove={(e) => move(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchEnd={() => {
        g.current.lastTouchAt = Date.now();
        end();
      }}
      onTouchCancel={reset}
      onMouseDown={(e) => fromMouse() && start(e.clientX, e.clientY)}
      onMouseMove={(e) => fromMouse() && move(e.clientX, e.clientY)}
      onMouseUp={() => fromMouse() && end()}
      onMouseLeave={() => fromMouse() && g.current.active && reset()}
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
          // Only a completed hold locks. A change without one (early release,
          // scroll, stray tap) is ignored - locks are final.
          if (g.current.armed) {
            g.current.firedFromChange = true;
            onDebug?.("switch");
            fire();
          }
        }}
      />
    </label>
  );
}
