// /lab only: mockups of how the-yahngorithm (the owner's model site) could
// show up inside Cavepicks. Static sample data, nothing live, no links to
// real game pages yet - every Joe badge just opens the yahngorithm home page.

const YAHN_URL = "https://the-yahngorithm.com";

function Joe({ size = 18 }: { size?: number }) {
  return (
    <img
      src="/yahn-joe.png"
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: "50%", verticalAlign: "-3px", flexShrink: 0, border: "1px solid var(--border-soft)" }}
    />
  );
}

/** the cross-link itself: Joe's face + a short label, opens the yahngorithm */
function YahnBadge({ label = "Yahn" }: { label?: string }) {
  return (
    <a
      href={YAHN_URL}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "3px 8px 3px 4px",
        borderRadius: "999px",
        border: "1px solid var(--border-soft)",
        background: "var(--panel-alt)",
        color: "var(--ink)",
        fontSize: "11px",
        fontWeight: 700,
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
    >
      <Joe size={18} />
      {label} <span style={{ color: "var(--dim)" }}>›</span>
    </a>
  );
}

function Pill({
  label,
  value,
  juice,
  yahn,
}: {
  label: string;
  value: string;
  juice: string;
  yahn?: string; // e.g. "+5.4" - Yahn's edge on this side
}) {
  return (
    <div
      className="pill-btn"
      style={{
        cursor: "default",
        position: "relative",
        ...(yahn ? { borderColor: "#c98a2b" } : {}),
      }}
    >
      <div className="pill-label">{label}</div>
      <div className="pill-value">{value}</div>
      <div className="pill-juice">{juice}</div>
      {yahn && (
        <span
          style={{
            position: "absolute",
            top: "6px",
            right: "6px",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "10px",
            fontWeight: 700,
            color: "#e0a94a",
          }}
        >
          <Joe size={16} />
          {yahn}
        </span>
      )}
    </div>
  );
}

function GameHeader({ title, meta, badge }: { title: string; meta: string; badge?: React.ReactNode }) {
  return (
    <>
      <div className="row-between" style={{ alignItems: "center" }}>
        <div className="matchup">{title}</div>
        {badge}
      </div>
      <div className="meta" style={{ marginTop: "2px" }}>{meta}</div>
    </>
  );
}

function Section({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="divider" />
      <strong style={{ fontSize: "13px" }}>{title}</strong>
      <p className="meta" style={{ margin: "2px 0 10px" }}>{blurb}</p>
      {children}
    </div>
  );
}

// Yahn's real Week 6 picks, copied by hand for the mock
const YAHN_PICKS = [
  { game: "UNC @ PITT", pick: "PITT -4.5", edge: "+10.8" },
  { game: "MISS @ VAN", pick: "VAN +10", edge: "+6.6" },
  { game: "TA&M @ MIZ", pick: "MIZ -3.5", edge: "+6.2" },
  { game: "TENN @ ARK", pick: "TENN -13.5", edge: "+5.4" },
  { game: "TULN @ ARMY", pick: "ARMY -3", edge: "+4.8" },
];

const inner: React.CSSProperties = {
  background: "var(--void)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "12px 14px",
};

export default function YahnMock() {
  return (
    <div className="card">
      <div className="matchup">
        <Joe size={20} /> Yahngorithm mockups
      </div>
      <p className="subtext" style={{ margin: "4px 0 0" }}>
        Ways the model site could show up here. Sample data, nothing live. Each Joe badge just opens the
        yahngorithm home page for now.
      </p>

      <Section
        title="A · Joe badge on every game"
        blurb="Link only. Tap Joe to open that game's page on the yahngorithm (model, lines, weather, flags). Shows nothing about what the model thinks."
      >
        <div style={inner}>
          <GameHeader title="TENN @ ARK" meta="Sat 11:00 AM · ABC" badge={<YahnBadge />} />
          <div className="pill-grid">
            <Pill label="TENN" value="-13.5" juice="-110" />
            <Pill label="ARK" value="+13.5" juice="-110" />
          </div>
        </div>
      </Section>

      <Section
        title="B · Joe marks the side Yahn picked"
        blurb="Joe's face and the model's edge sit on the side it took. No mark means the model has no pick on that game. Everyone would see this while picking."
      >
        <div style={inner}>
          <GameHeader title="TENN @ ARK" meta="Sat 11:00 AM · ABC" badge={<YahnBadge />} />
          <div className="pill-grid">
            <Pill label="TENN" value="-13.5" juice="-110" yahn="+5.4" />
            <Pill label="ARK" value="+13.5" juice="-110" />
          </div>
          <div className="pill-grid">
            <Pill label="Over" value="57.5" juice="-110" />
            <Pill label="Under" value="57.5" juice="-110" />
          </div>
        </div>
      </Section>

      <Section
        title="C · Yahn's picks card"
        blurb="One card (on the home page or the board) listing the model's picks for the week. Each row would open that game on the yahngorithm."
      >
        <div style={inner}>
          <div className="row-between" style={{ alignItems: "center" }}>
            <div className="matchup">
              <Joe size={20} /> Yahn&apos;s picks · Week 6
            </div>
            <span className="meta">season 25-24 · −1.27u</span>
          </div>
          <table className="stat-table">
            <thead>
              <tr>
                <th>Game</th>
                <th>Pick</th>
                <th>Edge</th>
              </tr>
            </thead>
            <tbody>
              {YAHN_PICKS.map((p) => (
                <tr key={p.game}>
                  <td>{p.game}</td>
                  <td style={{ color: "var(--ink)", fontWeight: 700 }}>{p.pick}</td>
                  <td style={{ color: "var(--up)" }}>{p.edge}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="meta" style={{ marginTop: "8px" }}>
            + 11 more · <a href={YAHN_URL} style={{ color: "var(--action-soft)" }}>see all on the yahngorithm ›</a>
          </div>
        </div>
      </Section>

      <Section
        title="D · Yahn as a ghost player"
        blurb="The model sits in the leaderboard like an 8th player, so everyone can see if they're beating it. Not in the pot, can't win money."
      >
        <div style={inner}>
          <div className="matchup">📊 Cavepicks Leaderboard</div>
          <table className="stat-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>W</th>
                <th>P</th>
                <th>L</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              <tr className="rank-first">
                <td className="rank-cell">🥇</td>
                <td>Player A</td>
                <td>17</td>
                <td>1</td>
                <td>12</td>
                <td>58.6%</td>
              </tr>
              <tr>
                <td className="rank-cell">2</td>
                <td>Player B</td>
                <td>16</td>
                <td>0</td>
                <td>14</td>
                <td>53.3%</td>
              </tr>
              <tr>
                <td className="rank-cell" style={{ color: "var(--dim)" }}>–</td>
                <td>
                  <Joe size={16} /> Yahn <span style={{ color: "var(--dim)", fontWeight: 400 }}>· bot</span>
                </td>
                <td>25</td>
                <td>0</td>
                <td>24</td>
                <td>51.0%</td>
              </tr>
              <tr>
                <td className="rank-cell">3</td>
                <td>Player C</td>
                <td>14</td>
                <td>1</td>
                <td>15</td>
                <td>48.3%</td>
              </tr>
            </tbody>
          </table>
          <div className="meta" style={{ marginTop: "8px" }}>
            Yahn makes its own picks all week, so its totals aren&apos;t 5 a week like everyone else&apos;s.
          </div>
        </div>
      </Section>
    </div>
  );
}
