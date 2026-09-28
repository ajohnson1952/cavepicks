// Haptic feedback for the web app. Client-only (touches `document`).
//
// iOS Safari has never supported navigator.vibrate. The workaround: iOS 18+
// plays a real system haptic whenever an `<input type="checkbox" switch>`
// toggles, including when it's toggled by clicking its <label>
// programmatically. So we keep one hidden switch + label in the page and
// click the label. Android/Chrome just use navigator.vibrate. Older iOS gets
// nothing (silently).
//
// iOS only honors this inside a user gesture (a tap/touchend handler) -
// calling it after an `await` usually does nothing. So fire on the tap
// itself; follow-up "success"/"error" patterns after a server round-trip
// are best-effort.

let label: HTMLLabelElement | null = null;

function ensureSwitch(): HTMLLabelElement | null {
  if (typeof document === "undefined") return null;
  if (label && document.body.contains(label)) return label;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = "haptic-switch";
  input.setAttribute("switch", "");
  input.setAttribute("aria-hidden", "true");
  input.tabIndex = -1;
  const l = document.createElement("label");
  l.htmlFor = input.id;
  l.setAttribute("aria-hidden", "true");
  for (const el of [input, l]) {
    el.style.position = "fixed";
    el.style.left = "-9999px";
    el.style.width = "1px";
    el.style.height = "1px";
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
  }
  document.body.append(input, l);
  label = l;
  return l;
}

function tick() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
      return;
    }
    ensureSwitch()?.click();
  } catch {
    // never let a haptic break a real action
  }
}

// One light tick - selections, taps, toggles.
export function hapticTap() {
  tick();
}

// Two quick ticks - something succeeded (lock in, refresh done, copied).
export function hapticSuccess() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate([12, 60, 12]);
    return;
  }
  tick();
  setTimeout(tick, 90);
}

// Three quick ticks - something was rejected.
export function hapticError() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate([20, 50, 20, 50, 20]);
    return;
  }
  tick();
  setTimeout(tick, 80);
  setTimeout(tick, 160);
}
