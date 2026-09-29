"use client";

import { useRef } from "react";

// A button that ticks on iPhone. iOS web has no haptics API and ignores
// every programmatic trick (script-clicking a hidden <input switch> is
// silent - confirmed on iOS 18.7 standalone, both here and in the
// the-yahngorithm project). The one thing that DOES tick: a real finger
// toggling an <input type="checkbox" switch>. So this renders a <label>
// styled like whatever button it replaces, with an invisible switch
// stretched over it (.haptic-input): the tap lands on the switch, iOS plays
// its haptic, and onChange runs the action. The switch is held unchecked so
// every tap is a fresh toggle (and a fresh tick).
//
// Scroll guard: unlike a <button>, a switch does NOT cancel when the finger
// moves - it can be swiped to toggle, and a tap that stops a momentum
// scroll toggles it too. On a long list of pick buttons that meant
// scrolling kept accidentally selecting things. So each touch is watched,
// and if the finger travels more than MOVE_SLOP px (or the touch began while
// the page was still gliding) the resulting change is simply ignored.
// NOTE: don't disable the switch mid-touch to block it instead - that made
// iOS swallow the gesture, so the first swipe wouldn't scroll ("sticky").
// CSS touch-action: pan-x pan-y on .haptic-toggle lets pans start at once.
//
// Android gets its buzz from lib/haptics.ts (navigator.vibrate), which the
// onPress handlers already call - don't vibrate here too.
//
// Limit: one tick per real tap. iOS can't do multi-tick patterns or ticks
// that aren't a direct tap (mid-drag, after a server round-trip).

const MOVE_SLOP = 10; // px of finger travel before a touch counts as a scroll
const MOMENTUM_MS = 150; // a touch this soon after a scroll event is "stopping the scroll", not a tap

let lastScrollAt = 0;
if (typeof window !== "undefined") {
  // capture: also catches scrolling inside nested scrollers (e.g. /guide's timeline)
  window.addEventListener("scroll", () => (lastScrollAt = Date.now()), { passive: true, capture: true });
}

export default function HapticButton({
  onPress,
  className,
  style,
  disabled,
  title,
  label,
  children,
}: {
  onPress: () => void;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  title?: string;
  /** accessible name, if the visible content isn't enough */
  label?: string;
  children: React.ReactNode;
}) {
  const touch = useRef({ active: false, x: 0, y: 0, cancelled: false });
  const endTouch = () =>
    // Keep the verdict until this touch's change event has fired.
    setTimeout(() => (touch.current.active = false), 350);

  return (
    <label
      className={`haptic-toggle${className ? ` ${className}` : ""}`}
      style={style}
      title={title}
      aria-disabled={disabled || undefined}
      onTouchStart={(e) => {
        const t = e.touches[0];
        touch.current = {
          active: true,
          x: t.clientX,
          y: t.clientY,
          cancelled: Date.now() - lastScrollAt < MOMENTUM_MS,
        };
      }}
      onTouchMove={(e) => {
        if (touch.current.cancelled) return;
        const t = e.touches[0];
        if (Math.abs(t.clientX - touch.current.x) > MOVE_SLOP || Math.abs(t.clientY - touch.current.y) > MOVE_SLOP) {
          touch.current.cancelled = true;
        }
      }}
      onTouchEnd={endTouch}
      onTouchCancel={() => {
        touch.current.cancelled = true;
        endTouch();
      }}
    >
      {children}
      <input
        type="checkbox"
        {...{ switch: "" }}
        className="haptic-input"
        checked={false}
        disabled={disabled}
        aria-label={label}
        onChange={() => {
          if (touch.current.active && touch.current.cancelled) return;
          onPress();
        }}
      />
    </label>
  );
}
