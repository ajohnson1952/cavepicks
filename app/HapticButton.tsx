"use client";

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
// Android gets its buzz from lib/haptics.ts (navigator.vibrate), which the
// onPress handlers already call - don't vibrate here too.
//
// Limit: one tick per real tap. iOS can't do multi-tick patterns or ticks
// that aren't a direct tap (mid-drag, after a server round-trip).
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
  return (
    <label
      className={`haptic-toggle${className ? ` ${className}` : ""}`}
      style={style}
      title={title}
      aria-disabled={disabled || undefined}
    >
      {children}
      <input
        type="checkbox"
        {...{ switch: "" }}
        className="haptic-input"
        checked={false}
        disabled={disabled}
        aria-label={label}
        onChange={() => onPress()}
      />
    </label>
  );
}
