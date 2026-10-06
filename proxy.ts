import { NextResponse, type NextRequest } from "next/server";

// Next 16 "proxy" (formerly middleware): keeps bots from waking the database.
//
// Every page here reads live from Neon, and the Free plan bills at least 5
// minutes of compute for each wake-up. In early Oct 2026 the database was
// being woken 12-19 times a night between midnight and 7am - nobody in a
// 7-person league is picking at 3am; that's crawlers (robots.txt only stops
// the polite ones). This is NOT caching: a real visitor still gets every page
// live, exactly as before.
//
// How: browsers keep cookies, almost all bots don't. A page request without
// our cookie never reaches the page - it gets a tiny static "door" page that
// sets the cookie and reloads. A browser comes straight back with the cookie
// (one blink, first visit only) and loads the real page; a bot just gets the
// door page again. The door page also carries the link-preview tags, so
// pasting a cavepicks.com link in the group chat still shows the card.
//
// Never applied to /api/* (cron-job.org and the-yahngorithm call those with
// no cookies) or to static files.
const COOKIE = "cp_seen";
const MARK = "_c"; // "we already tried to set the cookie once"
const ONE_YEAR = 60 * 60 * 24 * 365;

const SITE = "https://www.cavepicks.com";

function door(body: string, reloadTo: string | null): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cavepicks</title>
<meta name="description" content="College football pick'em with friends">
<meta property="og:title" content="Cavepicks">
<meta property="og:description" content="College football pick'em with friends">
<meta property="og:site_name" content="Cavepicks">
<meta property="og:image" content="${SITE}/opengraph-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="noindex">
${reloadTo ? `<meta http-equiv="refresh" content="0;url=${reloadTo}">` : ""}
<style>html,body{background:#0a0e0d;color:#7c8985;font-family:system-ui,sans-serif;margin:0}
p{padding:40px 20px;text-align:center;font-size:14px}</style></head>
<body><p>${body}</p>${reloadTo ? `<script>location.replace(${JSON.stringify(reloadTo)})</script>` : ""}</body></html>`;
}

export function proxy(req: NextRequest) {
  const url = req.nextUrl.clone();
  const hasCookie = !!req.cookies.get(COOKIE)?.value;

  if (hasCookie) {
    if (!url.searchParams.has(MARK)) return NextResponse.next();
    url.searchParams.delete(MARK); // passed the door - tidy the address bar
    return NextResponse.redirect(url, 307);
  }

  // No cookie, and we already tried once: cookies are off (or it's a bot).
  if (url.searchParams.has(MARK)) {
    return new NextResponse(door("Cavepicks needs cookies turned on to load. Enable them and reload.", null), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  // First cookieless visit: hand out the cookie and reload the same address.
  url.searchParams.set(MARK, "1");
  const res = new NextResponse(door("Loading Cavepicks…", url.pathname + url.search), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
  res.cookies.set(COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return res;
}

export const config = {
  // pages only: not /api, not Next internals, not static files
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|txt|xml|webmanifest)$).*)",
  ],
};
