"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// App-style navigation (Oct 2026): a brand bar on top (caveman + name + this
// week's pot) and the four main pages in a thumb-reach tab bar at the bottom,
// with everything else under "More". Related pages still show as sub-tabs
// under the brand bar while you're inside that section.
type Section = {
  key: "picks" | "board" | "live" | "standings";
  label: string;
  href: string;
  subs?: { label: string; href: string }[];
};

const SECTIONS: Section[] = [
  { key: "picks", label: "Picks", href: "/pick" },
  {
    key: "board",
    label: "Board",
    href: "/board",
    subs: [
      { label: "Board", href: "/board" },
      { label: "Yahngo's Picks", href: "/yahn" },
    ],
  },
  {
    key: "live",
    label: "Live",
    href: "/watch",
    subs: [
      { label: "Watch", href: "/watch" },
      { label: "Guide", href: "/guide" },
    ],
  },
  {
    key: "standings",
    label: "Standings",
    href: "/standings",
    subs: [
      { label: "Standings", href: "/standings" },
      { label: "Pot", href: "/pot" },
      { label: "History", href: "/history" },
    ],
  },
];

// Everything that isn't one of the four tabs. The section pages are repeated
// here so nothing is more than two taps away from anywhere.
const MORE_LINKS = [
  { label: "Yahngo's Picks", href: "/yahn" },
  { label: "Guide", href: "/guide" },
  { label: "Pot", href: "/pot" },
  { label: "History", href: "/history" },
  { label: "Rules", href: "/rules" },
  { label: "Admin", href: "/admin" },
];

const startsWith = (pathname: string, path: string) => pathname === path || pathname.startsWith(path + "/");
const inSection = (pathname: string, s: Section) =>
  s.subs ? s.subs.some((sub) => startsWith(pathname, sub.href)) : startsWith(pathname, s.href);

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const ICONS: Record<string, React.ReactNode> = {
  picks: <path {...stroke} d="M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />,
  board: <path {...stroke} d="M4 6h16M4 12h16M4 18h10" />,
  live: (
    <>
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      <path {...stroke} d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4" />
    </>
  ),
  standings: <path {...stroke} d="M5 20V10M12 20V4M19 20v-7" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </>
  ),
};

// The "My Picks" shortcut: each player's private link is remembered in this
// browser's localStorage the first time they open it (a home-screen app has
// its own storage, separate from Safari's).
function useMySlug(pathname: string) {
  const [mySlug, setMySlug] = useState<string | null>(null);
  useEffect(() => {
    const match = pathname.match(/^\/pick\/([^/]+)/);
    if (match) {
      localStorage.setItem("cavepicks_slug", match[1]);
      setMySlug(match[1]);
    } else {
      setMySlug(localStorage.getItem("cavepicks_slug"));
    }
  }, [pathname]);
  return mySlug;
}

/** Top: caveman + CAVEPICKS + this week's pot, and the section's sub-tabs. */
export default function Nav({ weekNumber, potAmount }: { weekNumber: number; potAmount: number | null }) {
  const pathname = usePathname();
  const activeSection = SECTIONS.find((s) => inSection(pathname, s));

  return (
    <nav className="nav-bar">
      <div className="brand-row">
        <a href="/" className="brand" aria-label="Cavepicks home">
          <img src="/icon-192.png" alt="" width={28} height={28} />
          <span className="brand-name">
            CAVE<span>PICKS</span>
          </span>
        </a>
        {weekNumber >= 1 && (
          <a href="/pot" className="brand-pill">
            WK {weekNumber}
            {potAmount != null && <> &middot; ${potAmount} POT</>}
          </a>
        )}
      </div>
      {activeSection?.subs && (
        <div className="nav-sub">
          {activeSection.subs.map((sub) => (
            <a key={sub.href} href={sub.href} className={`nav-sublink${startsWith(pathname, sub.href) ? " active" : ""}`}>
              {sub.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}

/** Bottom: the four main pages + More. Rendered OUTSIDE the pull-to-refresh
 *  wrapper in layout.tsx - that wrapper gets a CSS transform while pulling,
 *  which would drag a fixed bar along with the page. */
export function BottomNav() {
  const pathname = usePathname();
  const mySlug = useMySlug(pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [pathname]);

  const activeSection = SECTIONS.find((s) => inSection(pathname, s));
  const moreActive = !activeSection && pathname !== "/";

  return (
    <div data-no-ptr>
      {moreOpen && <div className="more-backdrop" onClick={() => setMoreOpen(false)} />}
      {moreOpen && (
        <div className="more-sheet" role="menu">
          {MORE_LINKS.map((l) => (
            <a key={l.href} href={l.href} role="menuitem" className={startsWith(pathname, l.href) ? "active" : ""}>
              {l.label}
            </a>
          ))}
        </div>
      )}
      <nav className="bottom-nav" aria-label="Main">
        {SECTIONS.map((s) => {
          const href = s.key === "picks" ? (mySlug ? `/pick/${mySlug}` : "/") : s.href;
          return (
            <a key={s.key} href={href} className={`bottom-tab${s === activeSection ? " active" : ""}`}>
              <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden>
                {ICONS[s.key]}
              </svg>
              {s.label}
            </a>
          );
        })}
        <button
          type="button"
          className={`bottom-tab${moreActive || moreOpen ? " active" : ""}`}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          onClick={() => setMoreOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden>
            {ICONS.more}
          </svg>
          More
        </button>
      </nav>
    </div>
  );
}
