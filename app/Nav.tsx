"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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

  const isActive = (path: string) => pathname === path || (path !== "/" && pathname.startsWith(path));

  return (
    <nav className="nav-bar">
      <a href={mySlug ? `/pick/${mySlug}` : "/"} className={`nav-link${isActive("/pick") ? " active" : ""}`}>
        My picks
      </a>
      <a href="/board" className={`nav-link${isActive("/board") ? " active" : ""}`}>
        Board
      </a>
      <a href="/standings" className={`nav-link${isActive("/standings") ? " active" : ""}`}>
        Standings
      </a>
    </nav>
  );
}
