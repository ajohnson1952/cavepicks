"use client";

import { useEffect, useState } from "react";

export type GuidePick = {
  id: string;
  name: string;
  label: string;
  outcomeLabel: string;
  outcomeCls: string;
  alive: boolean;
  isDog: boolean;
};

export type GuideGame = {
  id: string;
  away: string;
  home: string;
  leftPx: number;
  widthPx: number;
  phase: "pre" | "live" | "final";
  homeScore: number | null;
  awayScore: number | null;
  detail: string | null;
  timeLabel: string;
  broadcast: string | null;
  rel: "swing" | "watch" | "dog" | "cold";
  picks: GuidePick[];
};

export type GuideDay = {
  key: string;
  label: string;
  isToday: boolean;
  totalWidthPx: number;
  minMinutes: number;
  hourTicks: { leftPx: number; label: string }[];
  games: GuideGame[];
};

// Same trick used everywhere else in this app (see CLAUDE.md's timezone
// gotcha) - never trust the browser's own local time, always read the
// wall-clock time in Central via Intl so this matches the server's idea of
// "now" regardless of the viewer's own timezone.
function minutesSinceMidnightCT(d: Date): number {
  const parts = d.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [h, m] = parts.split(":").map(Number);
  return h * 60 + m;
}

function relStyle(rel: GuideGame["rel"]): { border: string; background: string } {
  switch (rel) {
    case "swing":
      return { border: "1px solid var(--action)", background: "rgba(47, 107, 255, 0.16)" };
    case "watch":
      return { border: "1px solid var(--border-soft)", background: "var(--panel-alt)" };
    case "dog":
      return { border: "1px solid var(--up)", background: "rgba(61, 220, 122, 0.1)" };
    default:
      return { border: "1px solid var(--border)", background: "var(--panel)" };
  }
}

function GameBar({ g, expanded, onToggle }: { g: GuideGame; expanded: boolean; onToggle: () => void }) {
  const style = relStyle(g.rel);
  const scoreLabel =
    g.homeScore != null && g.awayScore != null ? `${g.away} ${g.awayScore}–${g.homeScore} ${g.home}` : null;

  return (
    <button
      onClick={onToggle}
      className={g.phase === "live" ? "guide-bar guide-bar-live" : "guide-bar"}
      style={{
        position: "absolute",
        left: g.leftPx,
        width: g.widthPx,
        ...style,
        opacity: g.phase === "final" ? 0.55 : 1,
        outline: expanded ? "2px solid var(--action-soft)" : "none",
      }}
    >
      <div className="guide-bar-title">
        {g.away} @ {g.home}
      </div>
      <div className="guide-bar-sub">
        {g.phase === "pre" ? g.timeLabel : g.phase === "live" ? g.detail ?? "Live" : "Final"}
        {scoreLabel ? ` · ${scoreLabel}` : ""}
      </div>
    </button>
  );
}

function GamePanel({ g }: { g: GuideGame }) {
  return (
    <div className="card" style={{ marginTop: "6px" }}>
      <div className="matchup">
        {g.away} @ {g.home}
      </div>
      <div className="meta" style={{ marginTop: "2px" }}>
        {g.phase === "pre"
          ? `${g.timeLabel} CT${g.broadcast ? ` · ${g.broadcast}` : ""}`
          : g.phase === "live"
          ? `${g.detail ?? "Live"}${
              g.homeScore != null ? ` · ${g.away} ${g.awayScore}, ${g.home} ${g.homeScore}` : ""
            }`
          : `Final · ${g.away} ${g.awayScore}, ${g.home} ${g.homeScore}`}
      </div>
      <div className="divider" />
      {g.picks.length === 0 && <p className="subtext" style={{ margin: 0 }}>No picks on this game.</p>}
      {g.picks.map((p) => (
        <div key={p.id} style={{ fontSize: "13px", marginBottom: "3px" }}>
          <span style={{ fontWeight: p.alive ? 700 : 400, color: p.alive ? "var(--ink)" : "var(--dim)" }}>
            {p.name}
          </span>
          {!p.alive && p.outcomeLabel !== "not locked" && <span className="meta"> (out)</span>}
          {p.isDog && <span className="meta"> · dog</span>}
          {"  "}
          {p.label}{" "}
          <span className={p.outcomeCls} style={{ fontSize: "11px", fontWeight: 700 }}>
            {p.outcomeLabel}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function GuideTimeline({ days, pxPerHour }: { days: GuideDay[]; pxPerHour: number }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNowMinutes(minutesSinceMidnightCT(new Date()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {days.map((day) => {
        const expandedGame = day.games.find((g) => g.id === expandedId);
        const nowLeftPx =
          day.isToday && nowMinutes != null ? ((nowMinutes - day.minMinutes) / 60) * pxPerHour : null;
        const showNowLine = nowLeftPx != null && nowLeftPx >= 0 && nowLeftPx <= day.totalWidthPx;

        return (
          <section key={day.key} style={{ marginTop: "18px" }}>
            <h3 className="guide-day-header">{day.label}</h3>
            <div className="guide-scroll">
              <div className="guide-track" style={{ width: day.totalWidthPx, height: day.games.length * 52 + 24 }}>
                {day.hourTicks.map((t) => (
                  <div key={t.label + t.leftPx} className="guide-hour-tick" style={{ left: t.leftPx }}>
                    <div className="guide-hour-label">{t.label}</div>
                    <div className="guide-hour-line" />
                  </div>
                ))}
                {showNowLine && (
                  <div className="guide-now-line" style={{ left: nowLeftPx! }}>
                    <div className="guide-now-dot" />
                  </div>
                )}
                {day.games.map((g, i) => (
                  <div key={g.id} style={{ position: "absolute", top: 24 + i * 52, left: 0, right: 0, height: 44 }}>
                    <GameBar g={g} expanded={g.id === expandedId} onToggle={() => setExpandedId(g.id === expandedId ? null : g.id)} />
                  </div>
                ))}
              </div>
            </div>
            {expandedGame && <GamePanel g={expandedGame} />}
          </section>
        );
      })}
    </>
  );
}
