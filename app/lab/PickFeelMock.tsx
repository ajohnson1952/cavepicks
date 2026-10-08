"use client";
// /lab only: (1) the selected-pick colour - today's deep blue with white text
// vs the new light blue with dark text - and (2) three levels of movement for
// selecting a pick and switching tabs. Tap everything. Touches no data.
import { useState } from "react";

const CSS = `
.pf-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.pf-btn{background:var(--panel-alt);border:1px solid var(--border-soft);border-radius:6px;padding:10px;text-align:left;color:var(--ink);font-family:inherit;width:100%;cursor:pointer;-webkit-tap-highlight-color:transparent}
.pf-l{font-size:12px;color:var(--dim);font-weight:500}
.pf-v{font-family:var(--font-mono),monospace;font-size:15px;font-weight:600;margin-top:2px}
.pf-j{font-family:var(--font-mono),monospace;font-size:10px;color:var(--dim)}
/* colour A: today */
.pf-deep.on{background:var(--action);border-color:var(--action)}
.pf-deep.on .pf-l,.pf-deep.on .pf-j{color:#cfdcff}
.pf-deep.on .pf-v{color:#fff;font-weight:700}
/* colour B: light blue, dark text */
.pf-light.on{background:var(--action-soft);border-color:var(--action-soft)}
.pf-light.on .pf-l,.pf-light.on .pf-j{color:rgba(10,14,13,.72)}
.pf-light.on .pf-v{color:var(--void);font-weight:700}
/* movement: subtle */
.pf-subtle{transition:background-color .14s ease,border-color .14s ease,transform .09s ease}
.pf-subtle .pf-l,.pf-subtle .pf-v,.pf-subtle .pf-j{transition:color .14s ease}
.pf-subtle:active{transform:scale(.97)}
/* movement: bouncy */
.pf-bouncy{transition:background-color .2s ease,border-color .2s ease}
.pf-bouncy:active{transform:scale(.94)}
.pf-bouncy.on{animation:pf-pop .32s cubic-bezier(.3,1.6,.5,1)}
@keyframes pf-pop{0%{transform:scale(.92)}60%{transform:scale(1.05)}100%{transform:scale(1)}}
.pf-tabs{display:flex;background:var(--panel);border:1px solid var(--border);border-radius:8px;margin-top:8px;padding:6px 4px}
.pf-tab{flex:1;background:none;border:0;color:var(--dim);font:inherit;font-size:10px;font-weight:700;padding:4px 0;cursor:pointer;-webkit-tap-highlight-color:transparent}
.pf-tab i{display:block;width:18px;height:18px;border-radius:5px;margin:0 auto 3px;background:currentColor;opacity:.85}
.pf-tab.on{color:var(--action-soft)}
.pf-tabs.subtle .pf-tab{transition:color .14s ease}
.pf-tabs.subtle .pf-tab i{transition:transform .14s ease}
.pf-tabs.subtle .pf-tab.on i{transform:translateY(-2px)}
.pf-tabs.bouncy .pf-tab.on i{animation:pf-hop .4s cubic-bezier(.3,1.6,.5,1)}
@keyframes pf-hop{0%{transform:translateY(0) scale(1)}45%{transform:translateY(-6px) scale(1.15)}100%{transform:translateY(0) scale(1)}}
.pf-page{background:var(--void);border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:6px;font-size:13px}
.pf-page.subtle{animation:pf-fade .16s ease}
.pf-page.bouncy{animation:pf-slide .3s cubic-bezier(.2,.9,.3,1.1)}
@keyframes pf-fade{from{opacity:0}to{opacity:1}}
@keyframes pf-slide{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.pf-btn,.pf-tab i,.pf-page{animation:none!important;transition:none!important}}
`;

function Pair({ cls }: { cls: string }) {
  const [sel, setSel] = useState<"a" | "h" | null>("a");
  const btn = (k: "a" | "h", team: string, line: string) => (
    <button type="button" className={`pf-btn ${cls}${sel === k ? " on" : ""}`} onClick={() => setSel(sel === k ? null : k)}>
      <div className="pf-l">{team}</div>
      <div className="pf-v">{line}</div>
      <div className="pf-j">-110</div>
    </button>
  );
  return (
    <div className="pf-grid">
      {btn("a", "TENN", "-13.5")}
      {btn("h", "ARK", "+13.5")}
    </div>
  );
}

const TABS = ["Picks", "Board", "Live", "Standings"];
function Tabs({ level }: { level: "none" | "subtle" | "bouncy" }) {
  const [tab, setTab] = useState(0);
  return (
    <>
      <div className={`pf-tabs ${level}`}>
        {TABS.map((t, i) => (
          <button key={t} type="button" className={`pf-tab${tab === i ? " on" : ""}`} onClick={() => setTab(i)}>
            <i />
            {t}
          </button>
        ))}
      </div>
      <div key={tab} className={`pf-page ${level}`}>
        <strong>{TABS[tab]}</strong> page content
      </div>
    </>
  );
}

function Head({ children, note }: { children: React.ReactNode; note: string }) {
  return (
    <>
      <div className="divider" />
      <strong style={{ fontSize: "13px" }}>{children}</strong>
      <p className="meta" style={{ margin: "2px 0 0" }}>{note}</p>
    </>
  );
}

export default function PickFeelMock() {
  return (
    <div className="card">
      <style>{CSS}</style>
      <div className="matchup">👆 Selected-pick colour + movement</div>
      <p className="subtext" style={{ margin: "4px 0 0" }}>Tap the buttons and tabs. Samples only.</p>

      <Head note="Deep blue fill, white text.">Colour A &middot; today</Head>
      <Pair cls="pf-deep" />
      <Head note="The new shared light blue, with dark text. The text colour flips when you pick.">
        Colour B &middot; light blue, dark text
      </Head>
      <Pair cls="pf-light" />

      <Head note="What the app does now: the pick and the tab change instantly.">Movement 0 &middot; none (today)</Head>
      <Pair cls="pf-light" />
      <Tabs level="none" />

      <Head note="A quick colour fade and a tiny press-in on picks; the active tab icon lifts 2px; pages fade in. About a seventh of a second.">
        Movement 1 &middot; subtle
      </Head>
      <Pair cls="pf-light pf-subtle" />
      <Tabs level="subtle" />

      <Head note="Picks pop, the tab icon hops, pages slide in. Fun the first few times; this is the 'cute' end.">
        Movement 2 &middot; bouncy
      </Head>
      <Pair cls="pf-light pf-bouncy" />
      <Tabs level="bouncy" />
    </div>
  );
}
