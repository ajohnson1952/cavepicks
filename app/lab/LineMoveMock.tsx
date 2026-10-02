// /lab only: side-by-side mockups of how line movement could be shown on the
// pick buttons. Static sample data, nothing live.
//
// "Value" for a side = is today's number better or worse for THIS pick than
// the opener. Spread: your signed line going UP is better (+10 -> +12.5, or
// -10 -> -7.5). Totals: Over wants the number lower, Under wants it higher.

type Side = { label: string; now: number; open: number; kind: "spread" | "over" | "under" };

const GAMES: { title: string; note: string; rows: [Side, Side][] }[] = [
  {
    title: "MSST @ ALA",
    note: "Spread grew from 10 to 12.5. Total went up from 51.5 to 54.",
    rows: [
      [
        { label: "MSST", now: 12.5, open: 10, kind: "spread" },
        { label: "ALA", now: -12.5, open: -10, kind: "spread" },
      ],
      [
        { label: "Over", now: 54, open: 51.5, kind: "over" },
        { label: "Under", now: 54, open: 51.5, kind: "under" },
      ],
    ],
  },
  {
    title: "OU @ TEX",
    note: "Spread shrank from 6.5 to 3. Total went down from 49 to 47.5.",
    rows: [
      [
        { label: "OU", now: 3, open: 6.5, kind: "spread" },
        { label: "TEX", now: -3, open: -6.5, kind: "spread" },
      ],
      [
        { label: "Over", now: 47.5, open: 49, kind: "over" },
        { label: "Under", now: 47.5, open: 49, kind: "under" },
      ],
    ],
  },
];

const fmt = (s: Side, n: number) => (s.kind === "spread" ? (n > 0 ? `+${n}` : `${n}`) : `${n}`);

// + = better number for this pick than the opener, - = worse
function valueDelta(s: Side): number {
  if (s.kind === "under") return s.now - s.open;
  if (s.kind === "over") return s.open - s.now;
  return s.now - s.open;
}

type Variant = "current" | "b" | "rec";

function Pill({ s, variant }: { s: Side; variant: Variant }) {
  const v = valueDelta(s);
  const mag = Math.abs(v);
  // Today's behavior: spreads show the same arrow on both sides ("did the
  // spread get bigger"); totals show the move on Over and the reverse on Under.
  const bigger =
    s.kind === "spread" ? Math.abs(s.now) > Math.abs(s.open) : s.kind === "over" ? s.now > s.open : s.now < s.open;
  const good = v > 0;
  return (
    <div className="pill-btn" style={{ cursor: "default" }}>
      <div className="pill-label">{s.label}</div>
      <div className="pill-value" style={{ flexWrap: "wrap" }}>
        {fmt(s, s.now)}
        {variant === "current" && (
          <span className={bigger ? "move-up" : "move-down"}>
            {bigger ? "▲" : "▼"}
            {mag}
          </span>
        )}
        {variant === "b" && (
          <span className={good ? "move-up" : "move-down"} style={{ fontSize: "11px" }}>
            {good ? "▲" : "▼"} {mag} {good ? "better" : "worse"}
          </span>
        )}
        {variant === "rec" && (
          <span className={good ? "move-up" : "move-down"} style={{ fontSize: "11px", fontWeight: 700 }}>
            {good ? "+" : "−"}
            {mag}
          </span>
        )}
      </div>
      {variant === "rec" && <div className="pill-juice">open {fmt(s, s.open)}</div>}
    </div>
  );
}

const VARIANTS: { key: Variant; title: string; blurb: string }[] = [
  {
    key: "current",
    title: "Today",
    blurb: "Spreads: same arrow and color on both sides. Totals: up arrow on Over when the total rises, reversed on Under.",
  },
  {
    key: "b",
    title: "Option B · better / worse",
    blurb: "Green = a better number for that pick than the opener. Red = worse. The two sides are always opposite.",
  },
  {
    key: "rec",
    title: "Recommended · opener + value",
    blurb: "Shows the opening line in gray, plus a small colored number: green + = better number than the opener, red − = worse.",
  },
];

export default function LineMoveMock() {
  return (
    <div className="card">
      <div className="matchup">📈 Line movement mockups</div>
      <p className="subtext" style={{ margin: "4px 0 0" }}>
        Sample games, not live data. Same two games shown three ways.
      </p>
      {VARIANTS.map((v) => (
        <div key={v.key}>
          <div className="divider" />
          <strong style={{ fontSize: "13px" }}>{v.title}</strong>
          <p className="meta" style={{ margin: "2px 0 0" }}>{v.blurb}</p>
          {GAMES.map((g) => (
            <div key={g.title} style={{ marginTop: "10px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700 }}>{g.title}</div>
              <div className="meta">{g.note}</div>
              {g.rows.map((row, i) => (
                <div key={i} className="pill-grid" style={{ marginTop: "6px" }}>
                  <Pill s={row[0]} variant={v.key} />
                  <Pill s={row[1]} variant={v.key} />
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
