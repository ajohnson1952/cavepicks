"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { hapticTap } from "@/lib/haptics";

// Safari-style pull-to-refresh for the iOS home-screen app. Standalone web
// apps get no native pull-to-refresh (regular Safari does, so this stays off
// there). On activation we turn off iOS's own overscroll bounce
// (html.ptr-enabled in globals.css) and do the rubber-band ourselves:
// the whole page slides down with increasing resistance, an iOS activity
// wheel fills in spoke by spoke, and letting go past THRESHOLD refreshes.
//
// Refresh = router.refresh(): re-runs the server components (fresh data)
// without a full reload, so in-progress client state (e.g. a pick that's
// selected but not locked) survives.
//
// Anything inside [data-no-ptr] (e.g. the /guide game modal) is ignored.

const THRESHOLD = 64; // px of (damped) pull needed to trigger
const MAX_PULL = 130; // asymptote of the rubber band
const HOLD = 52; // where the page rests while refreshing
const SPOKES = 8;
const MIN_SPIN_MS = 650; // don't flash the spinner for a too-fast refresh

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// Exponential damping: tracks the finger 1:1-ish at first, then stiffens -
// the "bouncy" feel.
const damp = (dy: number) => MAX_PULL * (1 - Math.exp(-dy / (MAX_PULL * 1.6)));

export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [isPending, startTransition] = useTransition();
  const contentRef = useRef<HTMLDivElement>(null);
  const spinnerRef = useRef<HTMLDivElement>(null);
  const state = useRef({
    startX: 0,
    startY: 0,
    pull: 0,
    tracking: false,
    decided: false, // decided this gesture is a vertical pull (vs horizontal scroll)
    refreshing: false,
    refreshStarted: 0,
    crossed: false,
  });

  useEffect(() => {
    if (!isStandalone()) return;
    setEnabled(true);
    document.documentElement.classList.add("ptr-enabled");
    return () => document.documentElement.classList.remove("ptr-enabled");
  }, []);

  function render(pull: number, animate: boolean) {
    const content = contentRef.current;
    const spinner = spinnerRef.current;
    if (!content || !spinner) return;
    const t = animate ? "transform 0.38s cubic-bezier(0.2, 0.9, 0.3, 1.15)" : "none";
    content.style.transition = t;
    content.style.transform = pull > 0 ? `translate3d(0, ${pull}px, 0)` : "";
    spinner.style.transition = animate ? "opacity 0.25s, transform 0.38s cubic-bezier(0.2, 0.9, 0.3, 1.15)" : "none";
    const progress = Math.min(1, pull / THRESHOLD);
    spinner.style.opacity = String(pull > 4 ? Math.min(1, progress * 1.4) : 0);
    spinner.style.transform = `translate3d(-50%, ${Math.max(0, pull / 2 - 14)}px, 0) scale(${0.7 + 0.3 * progress})`;
    // Spokes appear one at a time as you pull, like iOS.
    if (!state.current.refreshing) {
      const shown = Math.round(progress * SPOKES);
      spinner.querySelectorAll<HTMLElement>(".ptr-spoke").forEach((el, i) => {
        el.style.visibility = i < shown ? "visible" : "hidden";
      });
    }
  }

  useEffect(() => {
    if (!enabled) return;
    const s = state.current;

    const onStart = (e: TouchEvent) => {
      if (s.refreshing || e.touches.length !== 1) return;
      if ((e.target as Element | null)?.closest?.("[data-no-ptr]")) return;
      if (window.scrollY > 0) return;
      s.startX = e.touches[0].clientX;
      s.startY = e.touches[0].clientY;
      s.tracking = true;
      s.decided = false;
      s.crossed = false;
      s.pull = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!s.tracking) return;
      const dx = e.touches[0].clientX - s.startX;
      const dy = e.touches[0].clientY - s.startY;
      if (!s.decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        // Sideways (e.g. the /guide timeline) or upward: not a pull.
        if (Math.abs(dx) > Math.abs(dy) || dy < 0 || window.scrollY > 0) {
          s.tracking = false;
          return;
        }
        s.decided = true;
      }
      // No preventDefault: at scrollY 0 with iOS's own bounce turned off
      // (html.ptr-enabled), a downward pull has nothing to scroll anyway.
      s.pull = damp(Math.max(0, dy));
      if (!s.crossed && s.pull >= THRESHOLD) {
        s.crossed = true;
        hapticTap(); // best-effort: iOS may ignore haptics mid-drag
      } else if (s.crossed && s.pull < THRESHOLD) {
        s.crossed = false;
      }
      render(s.pull, false);
    };

    const onEnd = () => {
      if (!s.tracking) return;
      s.tracking = false;
      if (!s.decided) return;
      if (s.pull >= THRESHOLD) {
        hapticTap();
        s.refreshing = true;
        s.refreshStarted = Date.now();
        spinnerRef.current?.classList.add("ptr-spinning");
        spinnerRef.current?.querySelectorAll<HTMLElement>(".ptr-spoke").forEach((el) => (el.style.visibility = "visible"));
        render(HOLD, true);
        startTransition(() => router.refresh());
      } else {
        render(0, true);
      }
      s.pull = 0;
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    // MUST stay passive. A non-passive (blocking) touchmove on the whole
    // document made iOS wait on JS before every scroll could start - the
    // site felt "sticky", worst right after a pick saved and React was busy.
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, router]);

  // Refresh finished: keep spinning a beat if it was instant, then spring back.
  useEffect(() => {
    const s = state.current;
    if (!s.refreshing || isPending) return;
    const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - s.refreshStarted));
    const id = setTimeout(() => {
      s.refreshing = false;
      spinnerRef.current?.classList.remove("ptr-spinning");
      render(0, true);
    }, wait);
    return () => clearTimeout(id);
  }, [isPending]);

  return (
    <>
      {enabled && (
        <div ref={spinnerRef} className="ptr-spinner" aria-hidden="true">
          <div className="ptr-wheel">
            {Array.from({ length: SPOKES }).map((_, i) => (
              <span
                key={i}
                className="ptr-spoke"
                style={{ transform: `rotate(${i * (360 / SPOKES)}deg)`, opacity: 0.25 + (0.75 * i) / (SPOKES - 1) }}
              />
            ))}
          </div>
        </div>
      )}
      <div ref={contentRef} className="ptr-content">
        {children}
      </div>
    </>
  );
}
