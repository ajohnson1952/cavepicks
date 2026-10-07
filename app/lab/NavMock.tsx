// /lab only: three directions for the navigation + title bar, drawn as
// phone-sized previews. Static pictures - nothing here is wired up, and the
// real nav (app/Nav.tsx) is unchanged.

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const ICONS: Record<string, React.ReactNode> = {
  Picks: <path {...stroke} d="M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />,
  Board: <path {...stroke} d="M4 6h16M4 12h16M4 18h10" />,
  Live: (
    <>
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      <path {...stroke} d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4" />
    </>
  ),
  Standings: <path {...stroke} d="M5 20V10M12 20V4M19 20v-7" />,
  More: (
    <>
      <circle cx="5" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </>
  ),
};

function Wordmark({ size = 15 }: { size?: number }) {
  return (
    <span style={{ fontWeight: 800, fontSize: size, letterSpacing: "0.06em", lineHeight: 1 }}>
      CAVE<span style={{ color: "var(--up)" }}>PICKS</span>
    </span>
  );
}

function Logo({ size = 26 }: { size?: number }) {
  return <img src="/icon-192.png" alt="" width={size} height={size} style={{ borderRadius: size * 0.25, display: "block" }} />;
}

function WeekPill() {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, color: "var(--dim)",
        border: "1px solid var(--border-soft)", borderRadius: 999, padding: "3px 8px", whiteSpace: "nowrap",
      }}
    >
      WK 6 &middot; $175 POT
    </span>
  );
}

// fake page content so the bars have something to sit on
function Filler() {
  const bar = (w: string, h = 9) => (
    <div style={{ width: w, height: h, borderRadius: 4, background: "var(--panel-alt)", marginBottom: 7 }} />
  );
  return (
    <div style={{ padding: "14px 12px" }}>
      <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Johnson&apos;s Picks</div>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 11px", marginBottom: 8 }}>
          {bar("55%", 11)}
          {bar("35%", 7)}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
            <div style={{ height: 34, borderRadius: 6, background: "var(--panel-alt)" }} />
            <div style={{ height: 34, borderRadius: 6, background: "var(--panel-alt)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative", width: "100%", maxWidth: 320, height: 430, margin: "10px auto 0",
        border: "1px solid var(--border-soft)", borderRadius: 22, overflow: "hidden", background: "var(--void)",
        display: "flex", flexDirection: "column",
      }}
    >
      {children}
    </div>
  );
}

const TABS = ["My Picks", "Board", "Live", "Standings"];

function TextTabs({ active }: { active: string }) {
  return (
    <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
      {TABS.map((t) => (
        <span
          key={t}
          className={`nav-link${t === active ? " active" : ""}`}
          style={{ fontSize: 11, padding: "5px 7px" }}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function SubTabs({ items, active }: { items: string[]; active: string }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "7px 12px 0", borderTop: "1px solid var(--border)" }}>
      {items.map((s) => (
        <span key={s} className={`nav-sublink${s === active ? " active" : ""}`} style={{ fontSize: 11 }}>
          {s}
        </span>
      ))}
    </div>
  );
}

function BottomTabs({ active }: { active: string }) {
  return (
    <div
      style={{
        display: "flex", background: "var(--panel)", borderTop: "1px solid var(--border)", padding: "6px 4px 10px",
      }}
    >
      {["Picks", "Board", "Live", "Standings", "More"].map((t) => {
        const on = t === active;
        return (
          <div
            key={t}
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              color: on ? "var(--action-soft)" : "var(--dim)", fontSize: 9.5, fontWeight: 700,
            }}
          >
            <svg viewBox="0 0 24 24" width={20} height={20}>{ICONS[t]}</svg>
            {t}
          </div>
        );
      })}
    </div>
  );
}

const barBase: React.CSSProperties = { background: "var(--panel)", borderBottom: "1px solid var(--border)" };

export default function NavMock() {
  return (
    <div className="card">
      <div className="matchup">🧭 Navigation + title bar mockups</div>
      <p className="subtext" style={{ margin: "4px 0 0" }}>
        The three directions that were on offer. A with name style 1 is live now - these are just the
        original pictures.
      </p>

      <div className="divider" />
      <strong style={{ fontSize: "13px" }}>A &middot; App style: brand bar on top, tabs at the bottom</strong>
      <p className="meta" style={{ margin: "2px 0 0" }}>
        Logo and name up top with this week&apos;s pot. The four main pages move to a thumb-reach bar at the
        bottom, like a phone app. Pot, History, Guide, Yahngo, Rules and Admin live under More.
      </p>
      <Phone>
        <div style={{ ...barBase, display: "flex", alignItems: "center", gap: 9, padding: "10px 12px" }}>
          <Logo />
          <Wordmark />
          <span style={{ marginLeft: "auto" }}>
            <WeekPill />
          </span>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <Filler />
        </div>
        <BottomTabs active="Picks" />
      </Phone>

      <div className="divider" />
      <strong style={{ fontSize: "13px" }}>B &middot; Branded header, tabs stay on top</strong>
      <p className="meta" style={{ margin: "2px 0 0" }}>
        Same tabs you have now, with a logo-and-name row added above them. Familiar, but the bar gets taller:
        up to three rows when a section has sub-tabs.
      </p>
      <Phone>
        <div style={barBase}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px 8px" }}>
            <Logo />
            <Wordmark />
            <span style={{ marginLeft: "auto" }}>
              <WeekPill />
            </span>
          </div>
          <div style={{ padding: "0 8px 8px" }}>
            <TextTabs active="Standings" />
          </div>
          <div style={{ paddingBottom: 8 }}>
            <SubTabs items={["Standings", "Pot", "History"]} active="Standings" />
          </div>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <Filler />
        </div>
      </Phone>

      <div className="divider" />
      <strong style={{ fontSize: "13px" }}>C &middot; Compact: logo in the tab row</strong>
      <p className="meta" style={{ margin: "2px 0 0" }}>
        The smallest change. The caveman sits at the left of the existing tab row and doubles as the home
        button. No name, no extra height.
      </p>
      <Phone>
        <div style={barBase}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 8px" }}>
            <Logo size={28} />
            <TextTabs active="Board" />
          </div>
          <div style={{ paddingBottom: 8 }}>
            <SubTabs items={["Board", "Yahngo's Picks"]} active="Board" />
          </div>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <Filler />
        </div>
      </Phone>

      <div className="divider" />
      <strong style={{ fontSize: "13px" }}>Name styles</strong>
      <p className="meta" style={{ margin: "2px 0 8px" }}>The wordmark could go a few ways. Any of them works with A or B.</p>
      <div style={{ display: "grid", gap: 8 }}>
        {[
          <Wordmark key="1" size={17} />,
          <span key="2" style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.01em" }}>Cavepicks</span>,
          <span key="3" style={{ fontWeight: 800, fontSize: 17, letterSpacing: "0.06em" }}>
            CAVE<span style={{ color: "var(--action-soft)" }}>PICKS</span>
          </span>,
          <span key="4" style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 600, fontSize: 15, letterSpacing: "0.04em" }}>
            cave<span style={{ color: "var(--up)" }}>picks</span>
          </span>,
        ].map((w, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--panel-alt)", borderRadius: 8, padding: "9px 11px" }}>
            <Logo size={26} />
            {w}
            <span className="meta" style={{ marginLeft: "auto" }}>{i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
