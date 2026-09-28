import type { Metadata, Viewport } from "next";
import { Manrope, Roboto_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Nav, { Footer } from "./Nav";
import PullToRefresh from "./PullToRefresh";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-sans",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.cavepicks.com"),
  title: "Cavepicks",
  description: "College football pick'em with friends",
  // Home-screen app on iOS: full-screen, dark status bar, "Cavepicks" label.
  // The icon itself comes from app/apple-icon.png, the link-preview card
  // from app/opengraph-image.png (both generated from design/*.svg).
  appleWebApp: { capable: true, title: "Cavepicks", statusBarStyle: "black" },
  openGraph: { title: "Cavepicks", description: "College football pick'em with friends", siteName: "Cavepicks" },
};

export const viewport: Viewport = {
  themeColor: "#0a0e0d",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${manrope.variable} ${robotoMono.variable}`}>
      <body>
        <PullToRefresh>
          <Nav />
          {children}
          <Footer />
        </PullToRefresh>
        <Analytics />
      </body>
    </html>
  );
}
