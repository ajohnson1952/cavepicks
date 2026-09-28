// Vibration patterns - ANDROID ONLY (navigator.vibrate). Silent elsewhere.
//
// iPhones get their haptic from HapticButton (app/HapticButton.tsx) instead:
// iOS web has no haptics API and ignores programmatic tricks - a script-
// clicked hidden <input switch> plays nothing (confirmed on iOS 18.7,
// standalone). Only a real finger on a switch ticks, once per tap. So on
// iOS every tappable control is a HapticButton and these calls are no-ops;
// multi-tick patterns (success/error/celebrate) exist only on Android.

function vibrate(p: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(p);
  } catch {
    // never let a haptic break a real action
  }
}

// One light tick - selections, taps, toggles.
export function hapticTap() {
  vibrate(12);
}

// Two quick ticks - something succeeded (lock in, copied).
export function hapticSuccess() {
  vibrate([12, 70, 12]);
}

// Three quick ticks - something was rejected.
export function hapticError() {
  vibrate([20, 60, 20, 60, 20]);
}

// Three stronger-spaced ticks - fully locked in for the week (5 + dog).
export function hapticCelebrate() {
  vibrate([30, 90, 30, 90, 60]);
}
