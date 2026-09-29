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
// scrolling kept accidentally selecting things. So each touch is watched:
// if the finger travels more than MOVE_SLOP px, or the touch began while the
// page was still scrolling, the switch is disabled for the rest of that
// touch (no toggle, no tick) and any change that slips through is ignored.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const touch = useRef({ active: false, x: 0, y: 0, cancelled: false });

  const suppress = () => {
    touch.current.cancelled = true;
    if (inputRef.current) inputRef.current.disabled = true;
  };

  return (
    <label
      className={`haptic-toggle${className ? ` ${className}` : ""}`}
      style={style}
      title={title}
      aria-disabled={disabled || undefined}
      onTouchStart={(e) => {
        const t = e.touches[0];
        touch.current = { active: true, x: t.clientX, y: t.clientY, cancelled: false };
        if (inputRef.current) inputRef.current.disabled = !!disabled;
        if (Date.now() - lastScrollAt < MOMENTUM_MS) suppress();
      }}
      onTouchMove={(e) => {
        if (touch.current.cancelled) return;
        const t = e.touches[0];
        if (Math.abs(t.clientX - touch.current.x) > MOVE_SLOP || Math.abs(t.clientY - touch.current.y) > MOVE_SLOP) {
          suppress();
        }
      }}
      onTouchEnd={() => {
        // Re-arm after this touch's (suppressed) change would have fired.
        setTimeout(() => {
          touch.current.active = false;
          if (inputRef.current) inputRef.current.disabled = !!disabled;
        }, 350);
      }}
      onTouchCancel={() => {
        suppress();
        setTimeout(() => {
          touch.current.active = false;
          if (inputRef.current) inputRef.current.disabled = !!disabled;
        }, 350);
      }}
    >
      {children}
      <input
        ref={inputRef}
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
