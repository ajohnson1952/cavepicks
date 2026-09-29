"use client";

import { useCallback, useEffect, useState } from "react";
import { hapticCelebrate, hapticError, hapticSuccess, hapticTap } from "@/lib/haptics";
import MoneyShower from "../pick/[slug]/MoneyShower";
import HapticButton from "../HapticButton";
import HoldToLock, { DEFAULT_HOLD_MS } from "../HoldToLock";

type Env = { ios: string | null; standalone: boolean; vibrate: boolean };

function readEnv(): Env {
  const ua = navigator.userAgent;
  const m = ua.match(/OS (\d+)[_.](\d+)/);
  const isIos = /iPhone|iPad|iPod/.test(ua);
  return {
    ios: isIos && m ? `${m[1]}.${m[2]}` : null,
    standalone:
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    vibrate: typeof navigator.vibrate === "function",
  };
}

export default function LabClient({ renderedAt }: { renderedAt: string }) {
  const [env, setEnv] = useState<Env | null>(null);
  const [showering, setShowering] = useState(false);
  const [side, setSide] = useState<"home" | "away" | null>(null);
  const [locked, setLocked] = useState(0);
  const [holdMs, setHoldMs] = useState(DEFAULT_HOLD_MS);
  const [lastLockVia, setLastLockVia] = useState<"switch" | "fallback" | "early" | null>(null);
  const endShower = useCallback(() => setShowering(false), []);

  useEffect(() => setEnv(readEnv()), []);

  const iosMajor = env?.ios ? Number(env.ios.split(".")[0]) : null;

  return (
    <>
      {showering && <MoneyShower onDone={endShower} />}

      <div className="card">
        <div className="matchup">📱 This device</div>
        <div className="divider" />
        {env && (
          <div style={{ fontSize: "13px", lineHeight: 1.7 }}>
            <div>
              iOS version: <span className="mono">{env.ios ?? "not iOS"}</span>{" "}
              {iosMajor != null &&
                (iosMajor >= 18 ? (
                  <span className="pick-win">✓ haptics supported</span>
                ) : (
                  <span className="pick-loss">✗ needs iOS 18+ for haptics</span>
                ))}
            </div>
            <div>
              Home-screen app: <span className="mono">{env.standalone ? "yes" : "no"}</span>{" "}
              {!env.standalone && <span className="meta">(pull-to-refresh only runs in the home-screen app)</span>}
            </div>
            <div>
              Standard vibration API: <span className="mono">{env.vibrate ? "yes (Android-style)" : "no (iPhone)"}</span>
            </div>
          </div>
        )}
        <p className="meta" style={{ margin: "8px 0 0" }}>
          On iPhone, every button gives exactly one tick when your finger taps it - that&apos;s the only haptic iOS
          lets a website play. Multi-tick patterns below only differ on Android. No tick at all? Check Settings →
          Sounds &amp; Haptics → System Haptics is on.
        </p>
      </div>

      <div className="card">
        <div className="matchup">〰️ Haptic patterns</div>
        <div className="divider" />
        <div className="pill-grid">
          <HapticButton className="btn" onPress={() => hapticTap()}>Tap (1)</HapticButton>
          <HapticButton className="btn" onPress={() => hapticSuccess()}>Success (2)</HapticButton>
          <HapticButton className="btn" onPress={() => hapticError()}>Error (3 quick)</HapticButton>
          <HapticButton className="btn" onPress={() => hapticCelebrate()}>Celebrate (3)</HapticButton>
        </div>
      </div>

      <div className="card">
        <div className="matchup">🏈 Fake pick</div>
        <p className="subtext" style={{ margin: "4px 0 0" }}>
          Same buttons and haptics as the real pick page. Tap a side again to unselect it; hold the lock button
          until it fills, then let go. Lock 5 to trigger the celebration.
        </p>
        <div className="pill-grid">
          {(["away", "home"] as const).map((s) => (
            <HapticButton
              key={s}
              className={`pill-btn${side === s ? " selected" : ""}`}
              onPress={() => {
                hapticTap();
                setSide((cur) => (cur === s ? null : s)); // tap again to unselect
              }}
            >
              <div className="pill-label">{s === "away" ? "Cavemen" : "Dinosaurs"}</div>
              <div className="pill-value">{s === "away" ? "+7.5" : "-7.5"}</div>
            </HapticButton>
          ))}
        </div>
        {side && (
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <HoldToLock
              holdMs={holdMs}
              onDebug={setLastLockVia}
              label={`Lock in (${locked}/5 locked)`}
              onLock={() => {
                const finishing = locked === 4;
                if (finishing) {
                  hapticCelebrate();
                  setShowering(true);
                  setLocked(0);
                } else {
                  hapticSuccess();
                  setLocked((n) => n + 1);
                }
                setSide(null);
              }}
            />
          </div>
        )}
        <div className="divider" />
        <div className="meta" style={{ marginBottom: "6px" }}>Hold length (find the longest one that still ticks)</div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {[250, 300, 350, 400, 450, 500].map((ms) => (
            <HapticButton
              key={ms}
              className={`btn${holdMs === ms ? " btn-lock" : ""}`}
              style={{ marginTop: 0, padding: "6px 10px" }}
              onPress={() => setHoldMs(ms)}
            >
              {ms / 1000}s
            </HapticButton>
          ))}
        </div>
        {lastLockVia && (
          <p className="meta" style={{ margin: "8px 0 0" }}>
            Last hold:{" "}
            {lastLockVia === "switch" ? (
              <span className="pick-win">locked via the switch ✓ (iPhone should have ticked)</span>
            ) : lastLockVia === "fallback" ? (
              <span className="pick-loss">locked via the backup ✗ (iOS treated it as a long press - no tick)</span>
            ) : (
              <span className="meta">let go before the bar filled - no lock</span>
            )}
          </p>
        )}
      </div>

      <div className="card">
        <div className="matchup">💵 Money shower</div>
        <div className="divider" />
        <HapticButton
          className="btn btn-lock"
          style={{ marginTop: 0 }}
          onPress={() => {
            hapticCelebrate();
            setShowering(true);
          }}
        >
          Make it rain
        </HapticButton>
      </div>

      <div className="card">
        <div className="matchup">🔄 Pull to refresh</div>
        <div className="divider" />
        <p style={{ fontSize: "13px", margin: 0 }}>
          In the home-screen app, scroll to the top and pull down. The time below changes when the page actually
          refreshes:
        </p>
        <p className="mono" style={{ fontSize: "13px", margin: "6px 0 0" }}>
          Server rendered at {renderedAt}
        </p>
      </div>
    </>
  );
}

