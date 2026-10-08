"use client";
// A JOKE, and temporary: a fake "please rate us 5 stars" pop-up that ambushes
// people on the Board. Cavepicks isn't in any app store. Two gags: whatever star
// you tap, all five fill in; and "Not now" dodges your finger a few times
// before it gives up and lets you leave.
//
// Each phone gets it TWICE (at least an hour apart), then never again - and it
// switches itself off for everyone after JOKE_ENDS regardless.
// TO TURN IT OFF NOW: set JOKE_ON to false.
// TO DELETE IT: remove this file, its <RateUsJoke /> line in app/board/page.tsx,
// and app/lab/RateUsMock.tsx (+ its two lines in app/lab/page.tsx).
import { useEffect, useState } from "react";

const JOKE_ON = true;
const JOKE_ENDS = Date.parse("2026-10-26T00:00:00-05:00"); // gone for everyone after this, seen or not
const TIMES_EACH = 2;
const GAP_MS = 60 * 60 * 1000; // the second ambush waits at least an hour after the first
const KEY = "cp_rate_joke"; // per phone: { n: times shown, t: when last shown }

const CSS = `
.ru-back{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:24px;animation:ru-fade .18s ease}
.ru-card{width:100%;max-width:300px;background:var(--panel-alt);border:1px solid var(--border-soft);border-radius:12px;padding:20px 18px 14px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.6);animation:ru-up .22s ease}
.ru-card img{border-radius:14px;display:block;margin:0 auto 10px}
.ru-title{font-weight:800;font-size:16px;color:var(--ink)}
.ru-body{font-size:13px;color:var(--dim);margin:6px 0 12px;line-height:1.4;min-height:36px}
.ru-stars{display:flex;justify-content:center;gap:6px;margin-bottom:14px}
.ru-star{background:none;border:0;padding:2px;font-size:30px;line-height:1;color:var(--border-soft);cursor:pointer;transition:color .12s ease,transform .12s ease;-webkit-tap-highlight-color:transparent}
.ru-star.on{color:var(--amber);transform:scale(1.12)}
.ru-row{position:relative;height:40px;border-top:1px solid var(--border-soft);margin:0 -18px;padding-top:6px}
.ru-btn{position:absolute;top:6px;left:50%;background:none;border:0;font:inherit;font-size:14px;font-weight:700;color:var(--action-soft);padding:8px 14px;cursor:pointer;white-space:nowrap;transform:translateX(-50%);transition:transform .16s cubic-bezier(.2,.9,.3,1.2);-webkit-tap-highlight-color:transparent}
@keyframes ru-fade{from{opacity:0}to{opacity:1}}
@keyframes ru-up{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
`;

// Where "Not now" runs to on each tap (px from its home spot, kept inside the
// card so it never leaves the screen), and what it says when it gets there.
// After the last one it comes home and actually works.
const DODGES = [
  { x: 74, y: -150, r: 6, label: "Not now" },
  { x: -78, y: -64, r: -8, label: "Too slow" },
  { x: 62, y: -226, r: 10, label: "Nope" },
  { x: -70, y: -118, r: -5, label: "So close" },
  { x: 0, y: 0, r: 0, label: "Fine. Not now" },
];

export function RateUsPopup({ onClose }: { onClose: () => void }) {
  const [filled, setFilled] = useState(0); // stars lit so far
  const [rated, setRated] = useState(false);
  const [dodges, setDodges] = useState(0); // times "Not now" has run away

  // whatever they tapped, light all five, one after another
  useEffect(() => {
    if (!rated || filled >= 5) return;
    const t = setTimeout(() => setFilled((n) => n + 1), 110);
    return () => clearTimeout(t);
  }, [rated, filled]);

  const done = rated && filled >= 5;
  return (
    <div className="ru-back" role="dialog" aria-modal="true" aria-label="Rate Cavepicks">
      <style>{CSS}</style>
      <div className="ru-card">
        <img src="/icon-192.png" alt="" width={56} height={56} />
        <div className="ru-title">{done ? "5 stars! Wow." : "Enjoying Cavepicks?"}</div>
        <div className="ru-body">
          {done
            ? "Thank you for your honest and completely voluntary feedback."
            : "Tap a star to rate us on the App Store. It really helps a small cave like ours."}
        </div>
        <div className="ru-stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`ru-star${n <= filled ? " on" : ""}`}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onClick={() => {
                if (!rated) {
                  setFilled(Math.min(n, 1));
                  setRated(true);
                }
              }}
            >
              ★
            </button>
          ))}
        </div>
        <div className="ru-row">
          {done ? (
            <button type="button" className="ru-btn" onClick={onClose}>
              You&apos;re welcome
            </button>
          ) : (
            <button
              type="button"
              className="ru-btn"
              style={
                dodges > 0
                  ? {
                      transform: `translateX(-50%) translate(${DODGES[dodges - 1].x}px, ${DODGES[dodges - 1].y}px) rotate(${DODGES[dodges - 1].r}deg)`,
                    }
                  : undefined
              }
              onClick={() => (dodges >= DODGES.length ? onClose() : setDodges(dodges + 1))}
            >
              {dodges > 0 ? DODGES[dodges - 1].label : "Not now"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Drop-in for a page: decides (per phone) whether to spring the joke. */
export default function RateUsJoke() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!JOKE_ON || Date.now() > JOKE_ENDS) return;
    let seen = { n: 0, t: 0 };
    try {
      seen = { ...seen, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
    } catch {
      return; // storage blocked: we couldn't count, so don't risk nagging forever
    }
    if (seen.n >= TIMES_EACH || Date.now() - seen.t < GAP_MS) return;
    // let them start reading the Board first - it's funnier
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ n: seen.n + 1, t: Date.now() }));
      } catch {
        return;
      }
      setOpen(true);
    }, 1800);
    return () => clearTimeout(timer);
  }, []);
  return open ? <RateUsPopup onClose={() => setOpen(false)} /> : null;
}
