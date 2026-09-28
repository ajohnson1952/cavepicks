"use client";

import { useCallback, useEffect, useState } from "react";
import { hapticCelebrate, hapticError, hapticSuccess, hapticTap } from "@/lib/haptics";
import MoneyShower from "../pick/[slug]/MoneyShower";

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
          No buzz on iOS 18+? Check Settings → Sounds &amp; Haptics → System Haptics is on.
        </p>
      </div>

      <div className="card">
        <div className="matchup">〰️ Haptic patterns</div>
        <div className="divider" />
        <div className="pill-grid">
          <button className="btn" onClick={() => hapticTap()}>Tap (1)</button>
          <button className="btn" onClick={() => hapticSuccess()}>Success (2)</button>
          <button className="btn" onClick={() => hapticError()}>Error (3 quick)</button>
          <button className="btn" onClick={() => hapticCelebrate()}>Celebrate (3)</button>
        </div>
      </div>

      <div className="card">
        <div className="matchup">🏈 Fake pick</div>
        <p className="subtext" style={{ margin: "4px 0 0" }}>
          Same buttons and haptics as the real pick page. Lock 5 to trigger the celebration.
        </p>
        <div className="pill-grid">
          {(["away", "home"] as const).map((s) => (
            <button
              key={s}
              className={`pill-btn${side === s ? " selected" : ""}`}
              onClick={() => {
                hapticTap();
                setSide(s);
              }}
            >
              <div className="pill-label">{s === "away" ? "Cavemen" : "Dinosaurs"}</div>
              <div className="pill-value">{s === "away" ? "+7.5" : "-7.5"}</div>
            </button>
          ))}
        </div>
        {side && (
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              className="btn btn-lock"
              style={{ flex: 1 }}
              onClick={() => {
                const finishing = locked === 4;
                if (finishing) {
                  hapticCelebrate();
                  setShowering(true);
                  setLocked(0);
                } else {
                  hapticTap();
                  setTimeout(hapticSuccess, 250); // mimics the real server round-trip
                  setLocked((n) => n + 1);
                }
                setSide(null);
              }}
            >
              Lock in ({locked}/5 locked)
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                hapticTap();
                setSide(null);
              }}
            >
              clear
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="matchup">💵 Money shower</div>
        <div className="divider" />
        <button
          className="btn btn-lock"
          style={{ marginTop: 0 }}
          onClick={() => {
            hapticCelebrate();
            setShowering(true);
          }}
        >
          Make it rain
        </button>
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

