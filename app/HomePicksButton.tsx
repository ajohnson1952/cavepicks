"use client";

import { useEffect, useState } from "react";

// The home page is server-rendered and has no idea who you are - your pick
// link lives in this browser's localStorage (set by Nav.tsx). Read it here.
export default function HomePicksButton() {
  const [slug, setSlug] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    try {
      setSlug(localStorage.getItem("cavepicks_slug"));
    } catch {
      setSlug(null);
    }
  }, []);

  if (slug === undefined) return <div style={{ height: "44px" }} />;

  if (!slug) {
    return (
      <p className="banner-note" style={{ margin: 0 }}>
        Open your private pick link once (it was texted to you) and this device will remember it. After that,
        you&apos;ll get a one-tap button here.
      </p>
    );
  }

  return (
    <a href={`/pick/${slug}`} className="btn btn-lock" style={{ display: "block", textAlign: "center", textDecoration: "none", marginTop: 0, padding: "13px 14px", fontSize: "13px" }}>
      Make my picks &rarr;
    </a>
  );
}
