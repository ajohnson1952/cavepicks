// /lab only: ways the link to the yahngorithm could look on each game of the
// pick sheet. Static samples - the real one (PickForm.tsx, .yahn-link) is
// unchanged until one of these is picked.

function Joe({ size = 18, faded = false }: { size?: number; faded?: boolean }) {
  return (
    <img
      src="/yahn-joe.png"
      alt=""
      width={size}
      height={size}
      style={{
        borderRadius: "50%",
        display: "block",
        flexShrink: 0,
        border: "1px solid var(--border-soft)",
        ...(faded ? { opacity: 0.4, filter: "grayscale(0.85)" } : {}),
      }}
    />
  );
}

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "3px 9px 3px 4px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
  textDecoration: "none",
};

function Card({
  corner,
  metaExtra,
  footer,
}: {
  corner?: React.ReactNode;
  metaExtra?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div style={{ background: "var(--void)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div className="matchup">TENN @ ARK</div>
        {corner}
      </div>
      <div className="meta" style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span>Sat 11:00 AM &middot; ABC</span>
        {metaExtra}
      </div>
      <div className="pill-grid">
        <div className="pill-btn" style={{ cursor: "default" }}>
          <div className="pill-label">TENN</div>
          <div className="pill-value">-13.5</div>
          <div className="pill-juice">-110</div>
        </div>
        <div className="pill-btn" style={{ cursor: "default" }}>
          <div className="pill-label">ARK</div>
          <div className="pill-value">+13.5</div>
          <div className="pill-juice">-110</div>
        </div>
      </div>
      {footer}
    </div>
  );
}

function Option({ n, title, blurb, children }: { n: number; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="divider" />
      <strong style={{ fontSize: "13px" }}>
        {n} &middot; {title}
      </strong>
      <p className="meta" style={{ margin: "2px 0 0" }}>{blurb}</p>
      {children}
    </div>
  );
}

export default function JoeButtonMock() {
  return (
    <div className="card">
      <div className="matchup">
        <span style={{ display: "inline-block", verticalAlign: "-4px", marginRight: 6 }}>
          <Joe size={20} />
        </span>
        Yahngo link on each game
      </div>
      <p className="subtext" style={{ margin: "4px 0 0" }}>
        Ways the link to the model site could look on the pick sheet. Samples only.
      </p>

      <Option n={0} title="Today" blurb="Small faded Joe in the corner. Easy to miss, which was the point - maybe too easy.">
        <Card corner={<Joe faded />} />
      </Option>

      <Option n={1} title="Grey pill with a word" blurb="Faded Joe plus the word “Model” in a quiet outlined pill. Clearly a button, still calm.">
        <Card
          corner={
            <span style={{ ...pill, color: "var(--dim)", border: "1px solid var(--border-soft)", background: "var(--panel-alt)" }}>
              <Joe size={16} faded /> Model ›
            </span>
          }
        />
      </Option>

      <Option n={2} title="Named pill" blurb="Same pill, but it says “Yahngo” and Joe is in color. Reads as a brand, a notch louder.">
        <Card
          corner={
            <span style={{ ...pill, color: "var(--ink)", border: "1px solid var(--border-soft)", background: "var(--panel-alt)" }}>
              <Joe size={16} /> Yahngo ›
            </span>
          }
        />
      </Option>

      <Option n={3} title="Text link in the kickoff line" blurb="Nothing in the corner. A small link sits after the time and channel, where details already live.">
        <Card
          metaExtra={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--action-soft)", fontWeight: 700 }}>
              &middot; <Joe size={13} /> model ›
            </span>
          }
        />
      </Option>

      <Option
        n={4}
        title="Quiet unless the model has a pick"
        blurb="Grey “Model” pill on most games; it turns amber and says which side when the model has a pick on that game. Replaces the little Joe marks on the buttons."
      >
        <Card
          corner={
            <span style={{ ...pill, color: "#e0a94a", border: "1px solid rgba(224,169,74,0.5)", background: "rgba(224,169,74,0.10)" }}>
              <Joe size={16} /> Yahngo: TENN +5.4 ›
            </span>
          }
        />
        <Card
          corner={
            <span style={{ ...pill, color: "var(--dim)", border: "1px solid var(--border-soft)", background: "var(--panel-alt)" }}>
              <Joe size={16} faded /> Model ›
            </span>
          }
        />
      </Option>

      <Option n={5} title="Footer line under the picks" blurb="Corner stays empty. A full-width link under the buttons, like a caption - biggest tap target, most room for words.">
        <Card
          footer={
            <div
              style={{
                display: "flex", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 9,
                borderTop: "1px dashed var(--border-soft)", fontSize: 11, fontWeight: 700, color: "var(--dim)",
              }}
            >
              <Joe size={15} faded /> See this game on the yahngorithm
              <span style={{ marginLeft: "auto" }}>›</span>
            </div>
          }
        />
      </Option>
    </div>
  );
}
