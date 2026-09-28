// Haptic feedback for the web app. Client-only (touches `document`).
//
// iOS Safari has never supported navigator.vibrate. The workaround: iOS 18+
// plays the system "switch" haptic whenever an `<input type="checkbox"
// switch>` is toggled - including by a programmatic click on the <label>
// wrapping it. What actually works (a first version with a persistent,
// off-screen, htmlFor-linked switch did NOT buzz on a real iPhone): a fresh
// label with the switch nested INSIDE it, display:none, appended, clicked,
// and removed on every tick. Android/Chrome just use navigator.vibrate.
// Older iOS, or System Haptics turned off in Settings, gets nothing.
//
// iOS only honors this during a user gesture (a tap handler, or shortly
// after one) - a tick fired after a slow `await` may be dropped. So fire on
// the tap itself; post-server-response patterns are best-effort.

function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

function tick() {
  try {
    if (canVibrate()) {
      navigator.vibrate(12);
      return;
    }
    if (typeof document === "undefined") return;
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.display = "none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    document.head.removeChild(label);
  } catch {
    // never let a haptic break a real action
  }
}

function pattern(count: number, gapMs: number, vibrate: number[]) {
  if (canVibrate()) {
    navigator.vibrate(vibrate);
    return;
  }
  tick();
  for (let i = 1; i < count; i++) setTimeout(tick, i * gapMs);
}

// One light tick - selections, taps, toggles.
export function hapticTap() {
  tick();
}

// Two quick ticks - something succeeded (lock in, copied).
export function hapticSuccess() {
  pattern(2, 110, [12, 70, 12]);
}

// Three quick ticks - something was rejected.
export function hapticError() {
  pattern(3, 110, [20, 60, 20, 60, 20]);
}

// Three stronger-spaced ticks - fully locked in for the week (5 + dog).
export function hapticCelebrate() {
  pattern(3, 150, [30, 90, 30, 90, 60]);
}
