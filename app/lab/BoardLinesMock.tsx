// /lab only: ways the Board could show each pick's opening line, the line it
// was locked at, and the closing line (or the current line before kickoff).
// Static samples - the real Board (app/board/page.tsx) is unchanged.

type Sample = {
  tag: "SPRD" | "TOTL" | "DOG";
  game: string;
  pick: string; // what the Board shows today
  paren: string;
  open: string;
  locked: string;
  last: string; // closing line, or the current line if the game hasn't kicked off
  lastLabel: "close" | "now";
  delta: number; // points better (+) or worse (-) than the close/now line
  when: string;
};

const PICKS: Sample[] = [
  { tag: "SPRD", game: "TENN @ ARK", pick: "ARK +13.5", paren: "(-114, FD)", open: "+12.5", locked: "+13.5", last: "+11.5", lastLabel: "close", delta: 2, when: "Sat 11:00 AM · ABC" },
  { tag: "TOTL", game: "OSU @ ILL", pick: "o47.5", paren: "(-110, DK)", open: "48.5", locked: "47.5", last: "50.5", lastLabel: "close", delta: 3, when: "Sat 11:00 AM · FOX" },
  { tag: "SPRD", game: "UGA @ AUB", pick: "AUB +3", paren: "(-110, FD)", open: "+3.5", locked: "+3", last: "+4.5", lastLabel: "close", delta: -1.5, when: "Sat 2:30 PM · CBS" },
  { tag: "SPRD", game: "MICH @ MINN", pick: "MICH -5.5", paren: "(-108, MGM)", open: "-4.5", locked: "-5.5", last: "-5.5", lastLabel: "now", delta: 0, when: "Sat 6:30 PM · NBC" },
  { tag: "SPRD", game: "BYU @ ARIZ", pick: "BYU -2.5", paren: "(-110, DK)", open: "-1.5", locked: "-2.5", last: "-4", lastLabel: "now", delta: 1.5, when: "Sat 9:15 PM · ESPN" },
];
const DOG: Sample = {
  tag: "DOG", game: "TENN @ ARK", pick: "ARK worth 13.5 pts", paren: "(+420 ML, FD)",
  open: "12.5", locked: "13.5", last: "11.5", lastLabel: "close", delta: 2, when: "Sat 11:00 AM · ABC",
};
const ALL = [...PICKS, DOG];
const TOTAL = ALL.reduce((s, p) => s + p.delta, 0);

const fmt = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "±0");
const tone = (d: number) => (d > 0 ? "var(--up)" : d < 0 ? "var(--down)" : "var(--dim)");

function Chip({ p, verbose = false }: { p: Sample; verbose?: boolean }) {
  return (
    <span
      className="mono"
      style={{
        display: "inline-block", marginLeft: 6, padding: "0 6px", borderRadius: 999, fontSize: 11, fontWeight: 700,
        color: tone(p.delta), border: `1px solid ${tone(p.delta)}`, opacity: p.delta === 0 ? 0.7 : 1, whiteSpace: "nowrap",
      }}
    >
      {fmt(p.delta)}
      {verbose ? ` vs ${p.lastLabel}` : ""}
    </span>
  );
}

function Head({ p }: { p: Sample }) {
  return (
    <>
      <span className="mono" style={{ color: "var(--dim)" }}>{p.tag}</span> {p.game} &mdash; {p.pick} {p.paren}
    </>
  );
}

function Trail({ p }: { p: Sample }) {
  const unit = p.tag === "DOG" ? " pts" : "";
  return (
    <span className="mono" style={{ fontSize: 11 }}>
      <span style={{ color: "var(--dim)" }}>open</span> {p.open}
      {unit} <span style={{ color: "var(--dim)" }}>&rarr; locked</span> <strong>{p.locked}{unit}</strong>{" "}
      <span style={{ color: "var(--dim)" }}>&rarr; {p.lastLabel}</span> {p.last}
      {unit}
    </span>
  );
}

function PlayerCard({ summary, children }: { summary?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--void)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginTop: 8 }}>
      <div className="matchup" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        Johnson
        {summary && (
          <span className="mono" style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: tone(TOTAL) }}>
            {fmt(TOTAL)} pts of line value
          </span>
        )}
      </div>
      <div className="meta" style={{ marginTop: 2 }}>5/5 locked &middot; dog locked</div>
      <div className="divider" />
      {children}
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

const row: React.CSSProperties = { fontSize: 13, marginBottom: 6 };

export default function BoardLinesMock() {
  return (
    <div className="card">
      <style>{`.blm summary::-webkit-details-marker{display:none}`}</style>
      <div className="matchup">📈 Board: open / locked / close on each pick</div>
      <p className="subtext" style={{ margin: "4px 0 0" }}>
        Four ways to show whether a lock beat the line. Green means the pick got a better number than the
        close; red means locking early cost points. Before kickoff the last number is the current line,
        labelled &ldquo;now&rdquo;. &ldquo;Open&rdquo; is our first pull of the week. Samples only.
      </p>

      <Option
        n={1}
        title="Chip only, tap for the detail"
        blurb="One small number per pick. Tap a pick to open the full open → locked → close line. Least clutter; the Board stays about as tall as it is now."
      >
        <PlayerCard>
          {ALL.map((p, i) => (
            <details key={i} open={i === 0} style={row} className="blm">
              <summary style={{ listStyle: "none", cursor: "pointer" }}>
                <Head p={p} />
                <Chip p={p} />
                <div className="meta" style={{ marginTop: 1 }}>{p.when}</div>
              </summary>
              <div style={{ margin: "3px 0 2px", padding: "4px 8px", background: "var(--panel-alt)", borderRadius: 6 }}>
                <Trail p={p} />
              </div>
            </details>
          ))}
        </PlayerCard>
        <p className="meta" style={{ margin: "6px 0 0" }}>↑ The first pick is shown tapped open.</p>
      </Option>

      <Option
        n={2}
        title="Always-on line under each pick"
        blurb="Every pick gets a second line with all three numbers, no tapping. Everything is visible at a glance, but each card grows by six lines."
      >
        <PlayerCard>
          {ALL.map((p, i) => (
            <div key={i} style={row}>
              <Head p={p} />
              <div style={{ marginTop: 1 }}>
                <Trail p={p} />
                <Chip p={p} />
              </div>
              <div className="meta" style={{ marginTop: 1 }}>{p.when}</div>
            </div>
          ))}
        </PlayerCard>
      </Option>

      <Option
        n={3}
        title="Player total up top, chips below"
        blurb="Option 1 plus a running total in the card header - how many points of line value this player banked for the week. Gives the group one number to argue about."
      >
        <PlayerCard summary>
          {ALL.map((p, i) => (
            <details key={i} style={row} className="blm">
              <summary style={{ listStyle: "none", cursor: "pointer" }}>
                <Head p={p} />
                <Chip p={p} />
                <div className="meta" style={{ marginTop: 1 }}>{p.when}</div>
              </summary>
              <div style={{ margin: "3px 0 2px", padding: "4px 8px", background: "var(--panel-alt)", borderRadius: 6 }}>
                <Trail p={p} />
              </div>
            </details>
          ))}
        </PlayerCard>
      </Option>

      <Option
        n={4}
        title="By game: who got the best number"
        blurb="A second view of the Board (a toggle next to the player view). One card per picked game: the line's path, then everyone who took it and the number they locked. Shows head-to-head who beat whom to the line."
      >
        <div style={{ background: "var(--void)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginTop: 8 }}>
          <div className="matchup">TENN @ ARK</div>
          <div className="meta" style={{ marginTop: 2 }}>
            <span className="mono">ARK open +12.5 &rarr; close +11.5</span> &middot; Sat 11:00 AM
          </div>
          <div className="divider" />
          {[
            { who: "Johnson", line: "ARK +13.5", when: "Tue 9:10 PM", d: 2 },
            { who: "Miller", line: "ARK +12.5", when: "Thu 7:42 AM", d: 1 },
            { who: "Yahngo", line: "ARK +12", when: "Thu 8:05 AM", d: 0.5, ghost: true },
            { who: "Davis", line: "ARK +11.5", when: "Sat 10:20 AM", d: 0 },
            { who: "Nguyen", line: "TENN -11", when: "Sat 10:28 AM", d: -0.5 },
          ].map((r) => (
            <div
              key={r.who}
              style={{
                display: "flex", alignItems: "baseline", gap: 8, fontSize: 13, marginBottom: 4,
                ...(r.ghost ? { color: "var(--dim)", fontStyle: "italic" } : {}),
              }}
            >
              <span style={{ width: 70, flexShrink: 0 }}>{r.who}</span>
              <span className="mono">{r.line}</span>
              <span className="meta">{r.when}</span>
              <span className="mono" style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: tone(r.d) }}>{fmt(r.d)}</span>
            </div>
          ))}
        </div>
        <div style={{ background: "var(--void)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginTop: 8 }}>
          <div className="matchup">BYU @ ARIZ</div>
          <div className="meta" style={{ marginTop: 2 }}>
            <span className="mono">BYU open -1.5 &rarr; now -4</span> &middot; Sat 9:15 PM
          </div>
          <div className="divider" />
          {[
            { who: "Johnson", line: "BYU -2.5", when: "Wed 6:30 PM", d: 1.5 },
            { who: "Davis", line: "ARIZ +3.5", when: "Thu 12:15 PM", d: -0.5 },
          ].map((r) => (
            <div key={r.who} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13, marginBottom: 4 }}>
              <span style={{ width: 70, flexShrink: 0 }}>{r.who}</span>
              <span className="mono">{r.line}</span>
              <span className="meta">{r.when}</span>
              <span className="mono" style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: tone(r.d) }}>{fmt(r.d)}</span>
            </div>
          ))}
        </div>
      </Option>
    </div>
  );
}
