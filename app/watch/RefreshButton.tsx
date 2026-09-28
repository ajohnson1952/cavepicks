"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { hapticTap } from "@/lib/haptics";
import HapticButton from "../HapticButton";

// Saturday auto-refresh: re-pulls every AUTO_REFRESH_MS, but only on a
// Saturday (Central), only while a picked game is actually live, and only
// while this tab is visible - so an idle or backgrounded tab never keeps
// Neon's compute awake. Each refresh is a few small DB reads + free ESPN
// calls; it never touches The Odds API.
const AUTO_REFRESH_MS = 90_000;

function isSaturdayCT(): boolean {
  return new Date().toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short" }) === "Sat";
}

// Re-runs the server component (fresh ESPN pull) without a full page reload.
export default function RefreshButton({ asOf, hasLiveGame = false }: { asOf: string; hasLiveGame?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const autoOn = hasLiveGame && isSaturdayCT();

  useEffect(() => {
    if (!autoOn) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    }, AUTO_REFRESH_MS);
    // Coming back to the tab after a while: refresh right away instead of
    // showing a stale score until the next tick.
    const onVisible = () => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [autoOn, router]);

  return (
    <div className="row-between" style={{ marginBottom: "12px" }}>
      <span className="meta">
        as of {asOf}
        {pending ? " · refreshing…" : autoOn ? " · auto-updating" : ""}
      </span>
      <HapticButton
        className="btn"
        disabled={pending}
        onPress={() => {
          hapticTap();
          startTransition(() => router.refresh());
        }}
      >
        {pending ? "…" : "Refresh"}
      </HapticButton>
    </div>
  );
}
