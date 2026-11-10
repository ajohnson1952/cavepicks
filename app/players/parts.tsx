// Shared bits for /players, /players/[name] and the /stats boards.
import type { Rec, WeekPoint, Form } from "@/lib/playerStats";
import { MIN_SAMPLE, recText } from "@/lib/playerStats";

export { recText };

export const pctText = (r: Rec) => (r.pct == null ? "—" : `${r.pct.toFixed(0)}%`);
const thin = (r: Rec) => r.w + r.l < MIN_SAMPLE;

/** Record + win% for one split. Greyed when the sample is too small to mean much. */
export function RecSpan({ r, showPct = true }: { r: Rec; showPct?: boolean }) {
  if (r.n === 0) return <span className="meta">none</span>;
  const tone = thin(r) || r.pct == null ? "" : r.pct >= 55 ? "pick-win" : r.pct <= 45 ? "pick-loss" : "";
  return (
    <span className={`mono ${tone}`} style={{ opacity: thin(r) ? 0.5 : 1, fontSize: "12px" }}>
      {recText(r)}
      {showPct && <span style={{ marginLeft: "6px" }}>{pctText(r)}</span>}
    </span>
  );
}

/** A labeled split table: how often they land in each bucket, and how it's gone. */
export function SplitTable({
  rows,
  shareLabel = "Share",
}: {
  rows: { label: string; rec: Rec; share: number }[];
  shareLabel?: string;
}) {
  if (rows.length === 0) return <p className="meta" style={{ margin: "4px 0 0" }}>Nothing graded yet.</p>;
  return (
    <table className="stat-table">
      <thead>
        <tr>
          <th></th>
          <th>{shareLabel}</th>
          <th>Record</th>
          <th>%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((x) => (
          <tr key={x.label} style={{ opacity: thin(x.rec) ? 0.5 : 1 }}>
            <td style={{ fontFamily: "inherit" }}>{x.label}</td>
            <td>{x.share.toFixed(0)}%</td>
            <td>{recText(x.rec)}</td>
            <td className={thin(x.rec) || x.rec.pct == null ? "" : x.rec.pct >= 55 ? "pick-win" : x.rec.pct <= 45 ? "pick-loss" : ""}>
              {pctText(x.rec)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Two opposite splits on one row (Favorites vs Underdogs...): the lean bar plus each side's record. */
export function VsRow({ left, right, leftLabel, rightLabel }: { left: Rec; right: Rec; leftLabel: string; rightLabel: string }) {
  const total = left.n + right.n;
  if (total === 0) return null;
  const leftShare = Math.round((left.n / total) * 100);
  return (
    <div className="split-row">
      <div className="row-between">
        <span>
          {leftLabel} <strong>{leftShare}%</strong>
        </span>
        <span>
          <strong>{100 - leftShare}%</strong> {rightLabel}
        </span>
      </div>
      <div className="split-bar">
        <div style={{ width: `${leftShare}%` }} />
      </div>
      <div className="row-between meta">
        <RecSpan r={left} />
        <RecSpan r={right} />
      </div>
    </div>
  );
}

/** 🚬 = heater. Hot but still under .500 on the season gets the air quotes. */
export function FormBadge({ status, seasonPct }: { status: Form["status"]; seasonPct?: number | null }) {
  if (!status) return null;
  const label = status === "cold" ? "🧊 Cold" : seasonPct != null && seasonPct < 50 ? "🚬 \u201cHot\u201d" : "🚬 Hot";
  return <span className={`form-badge ${status}`}>{label}</span>;
}

/**
 * Week-by-week trend: a bar per week (that week's hit rate), the rolling
 * 3-week line on top, and a dashed line at their season average. 50% is the
 * faint middle line - above it is winning.
 */
export function TrendChart({ series, season, height = 120 }: { series: WeekPoint[]; season: number | null; height?: number }) {
  if (series.length === 0) return <p className="meta">No graded weeks yet.</p>;
  const W = 320;
  const H = height;
  const pad = { l: 26, r: 6, t: 8, b: 18 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const step = iw / series.length;
  const y = (pct: number) => pad.t + ih - (pct / 100) * ih;
  const x = (i: number) => pad.l + step * i + step / 2;
  const rolling = series
    .map((p, i) => (p.rolling == null ? null : `${x(i).toFixed(1)},${y(p.rolling).toFixed(1)}`))
    .filter(Boolean);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Win rate by week" style={{ display: "block", marginTop: "6px" }}>
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke="var(--border-soft)" strokeWidth={g === 50 ? 1 : 0.5} />
          <text x={pad.l - 4} y={y(g) + 3} textAnchor="end" fontSize="8" fill="var(--dim)">
            {g}%
          </text>
        </g>
      ))}
      {series.map((p, i) => {
        if (p.pct == null) return null;
        const bw = Math.min(16, step * 0.55);
        const top = y(p.pct);
        const color = p.pct >= 60 ? "var(--up)" : p.pct <= 40 ? "var(--down)" : "var(--dim)";
        return (
          <g key={p.week}>
            <rect x={x(i) - bw / 2} y={top} width={bw} height={Math.max(1, y(0) - top)} rx="2" fill={color} opacity="0.35" />
            <text x={x(i)} y={H - 5} textAnchor="middle" fontSize="8" fill="var(--dim)">
              {p.week}
            </text>
          </g>
        );
      })}
      {season != null && (
        <line x1={pad.l} x2={W - pad.r} y1={y(season)} y2={y(season)} stroke="var(--amber)" strokeWidth="1" strokeDasharray="3 3" />
      )}
      {rolling.length >= 2 && <polyline points={rolling.join(" ")} fill="none" stroke="var(--action)" strokeWidth="2" strokeLinejoin="round" />}
      {series.map((p, i) =>
        p.rolling == null ? null : <circle key={p.week} cx={x(i)} cy={y(p.rolling)} r="2.5" fill="var(--action)" />
      )}
    </svg>
  );
}

/** Tiny rolling-form line for list rows. */
export function Sparkline({ series }: { series: WeekPoint[] }) {
  const pts = series.filter((p) => p.pct != null);
  if (pts.length < 2) return null;
  const W = 64, H = 20;
  const xs = (i: number) => (i / (pts.length - 1)) * (W - 4) + 2;
  const ys = (v: number) => H - 2 - (v / 100) * (H - 4);
  const vals = pts.map((p) => p.rolling ?? p.pct!);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <line x1="0" x2={W} y1={ys(50)} y2={ys(50)} stroke="var(--border-soft)" strokeWidth="1" />
      <polyline points={vals.map((v, i) => `${xs(i)},${ys(v)}`).join(" ")} fill="none" stroke="var(--action)" strokeWidth="1.5" />
    </svg>
  );
}

export function ChartKey() {
  return (
    <p className="meta" style={{ margin: "6px 0 0", lineHeight: 1.5 }}>
      Bars = that week&apos;s hit rate. <span style={{ color: "var(--action)" }}>Blue line</span> = rolling 3 weeks.{" "}
      <span style={{ color: "var(--amber)" }}>Dashed</span> = season average.
    </p>
  );
}
