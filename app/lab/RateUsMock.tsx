"use client";
// /lab only, for now: the joke "please rate us 5 stars" pop-up. Not a real
// review prompt - Cavepicks isn't in any app store. Two gags: whatever star
// you tap, all five fill in; and "Not now" dodges your finger once before it
// lets you leave. Self-contained so it can be dropped into the real app
// behind a switch later, and deleted just as easily.
import { useEffect, useState } from "react";

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
.ru-btn.dodged{transform:translateX(-50%) translate(74px,-150px) rotate(6deg)}
@keyframes ru-fade{from{opacity:0}to{opacity:1}}
@keyframes ru-up{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
`;

export function RateUsPopup({ onClose }: { onClose: () => void }) {
  const [filled, setFilled] = useState(0); // stars lit so far
  const [rated, setRated] = useState(false);
  const [dodged, setDodged] = useState(false);

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
              className={`ru-btn${dodged ? " dodged" : ""}`}
              onClick={() => (dodged ? onClose() : setDodged(true))}
            >
              {dodged ? "Fine. Not now" : "Not now"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RateUsMock() {
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <div className="matchup">⭐ The fake &ldquo;rate us&rdquo; pop-up</div>
      <p className="subtext" style={{ margin: "4px 0 10px" }}>
        The joke review prompt. Tap any star and all five fill in. &ldquo;Not now&rdquo; jumps away the first
        time you go for it. Only lives here until it&apos;s switched on.
      </p>
      <button type="button" className="btn btn-lock" onClick={() => setOpen(true)}>
        Show the pop-up
      </button>
      {open && <RateUsPopup onClose={() => setOpen(false)} />}
    </div>
  );
}
