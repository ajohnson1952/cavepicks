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
  away = "TENN",
  home = "ARK",
  awayLine = "-13.5",
  homeLine = "+13.5",
  when = "Sat 11:00 AM \u00b7 ABC",
}: {
  corner?: React.ReactNode;
  metaExtra?: React.ReactNode;
  footer?: React.ReactNode;
  away?: string;
  home?: string;
  awayLine?: string;
  homeLine?: string;
  when?: string;
}) {
  return (
    <div style={{ background: "var(--void)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div className="matchup">
          {away} @ {home}
        </div>
        {corner}
      </div>
      <div className="meta" style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span>{when}</span>
        {metaExtra}
      </div>
      <div className="pill-grid">
        <div className="pill-btn" style={{ cursor: "default" }}>
          <div className="pill-label">{away}</div>
          <div className="pill-value">{awayLine}</div>
          <div className="pill-juice">-110</div>
        </div>
        <div className="pill-btn" style={{ cursor: "default" }}>
          <div className="pill-label">{home}</div>
          <div className="pill-value">{homeLine}</div>
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
        The options that were on offer. Option 4 is live now, showing the model&apos;s projected line
        instead of its edge. Samples only.
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

      <Option
        n={6}
        title="The model's number is the link"
        blurb="Nothing in the corner. The kickoff line ends with what the model makes the spread, and that is the link. It gives a reason to tap, and takes no extra room - but it shows the model's lean on every game, not just its picks."
      >
        <Card
          metaExtra={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--action-soft)", fontWeight: 700 }}>
              &middot; <Joe size={13} /> model TENN -18.9 ›
            </span>
          }
        />
        <p className="meta" style={{ margin: "6px 0 0" }}>
          ↑ Model is 5.4 points off the line here. ↓ Here it agrees with the line, so there&apos;s little to see.
        </p>
        <Card
          away="MICH"
          home="MINN"
          awayLine="-5.5"
          homeLine="+5.5"
          when={"Sat 2:30 PM \u00b7 FOX"}
          metaExtra={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--action-soft)", fontWeight: 700 }}>
              &middot; <Joe size={13} /> model MICH -5.3 ›
            </span>
          }
        />
        <p className="meta" style={{ margin: "10px 0 0" }}>
          A quieter take on the same idea: same spot, grey instead of blue, no Joe.
        </p>
        <Card
          metaExtra={
            <span style={{ color: "var(--dim)", fontWeight: 700, textDecoration: "underline", textDecorationColor: "var(--border-soft)" }}>
              &middot; model TENN -18.9 ›
            </span>
          }
        />
      </Option>
    </div>
  );
}
