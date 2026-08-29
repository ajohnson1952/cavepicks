import { Manrope, Roboto_Mono } from "next/font/google";
import Nav from "./Nav";
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

export const metadata = {
  title: "Cavepicks",
  description: "College football pick'em with friends",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${manrope.variable} ${robotoMono.variable}`}>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
