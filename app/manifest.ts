import type { MetadataRoute } from "next";

// Lets iOS/Android "Add to Home Screen" open Cavepicks like a standalone app
// (own icon, no browser bar). Icon art lives in design/caveman-logo.svg.
// No start_url on purpose: it then defaults to the page it was added from.
// A home-screen app has its own storage separate from Safari, so the "My
// Picks" nav shortcut (localStorage) starts empty there - adding it from
// your own /pick/<slug> link makes the app open straight to your picks and
// remember you from then on.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cavepicks",
    short_name: "Cavepicks",
    description: "College football pick'em with friends",
    // Whole site is "inside the app". Without this, scope defaults to the
    // folder of the page it was added from - add it from /pick/<slug> and
    // every other page (/board, /pot...) counted as leaving the app, so iOS
    // showed Safari's navigation bar there.
    scope: "/",
    display: "standalone",
    background_color: "#0a0e0d",
    theme_color: "#0a0e0d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
