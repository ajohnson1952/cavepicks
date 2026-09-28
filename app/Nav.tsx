"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Four main tabs. Related pages live under one tab as sub-tabs (shown only
// while you're in that section) so the top bar doesn't sprawl. Rules and
// Admin are footer links - see Footer below.
type Section = { label: string; href: string; subs?: { label: string; href: string }[] };

const SECTIONS: Section[] = [
  { label: "My Picks", href: "/pick" },
  { label: "Board", href: "/board" },
  {
    label: "Live",
    href: "/watch",
    subs: [
      { label: "Watch", href: "/watch" },
      { label: "Guide", href: "/guide" },
    ],
  },
  {
    label: "Standings",
    href: "/standings",
    subs: [
      { label: "Standings", href: "/standings" },
      { label: "Pot", href: "/pot" },
      { label: "History", href: "/history" },
    ],
  },
];

const startsWith = (pathname: string, path: string) => pathname === path || pathname.startsWith(path + "/");

export default function Nav() {
  const pathname = usePathname();
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

  const inSection = (s: Section) =>
    s.subs ? s.subs.some((sub) => startsWith(pathname, sub.href)) : startsWith(pathname, s.href);
  const activeSection = SECTIONS.find(inSection);

  return (
    <nav className="nav-bar">
      <div className="nav-main">
        {SECTIONS.map((s) => {
          const href = s.href === "/pick" ? (mySlug ? `/pick/${mySlug}` : "/") : s.href;
          return (
            <a key={s.label} href={href} className={`nav-link${s === activeSection ? " active" : ""}`}>
              {s.label}
            </a>
          );
        })}
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

export function Footer() {
  return (
    <footer className="site-footer">
      <a href="/rules">Rules</a>
      <span>&middot;</span>
      <a href="/admin">Admin</a>
    </footer>
  );
}
