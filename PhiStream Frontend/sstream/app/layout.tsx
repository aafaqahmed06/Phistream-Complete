import type { Metadata } from "next";
import { DM_Sans, Fraunces, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Scanlines } from "@/components/ui/Scanlines";
import "./globals.css";

/**
 * Fraunces carries the whole typographic idea, so its variable axes matter:
 * SOFT rounds the terminals and WONK swaps in the eccentric letterforms. At
 * WONK 0 it reads as an expensive corporate serif; cranked up it gets strange.
 * That range is the "expensive serif wearing a gold sticker" brief expressed in
 * a single family -- the light end sets the sentences, the heavy wonky end sets
 * the four or five words that have to land.
 *
 * If the build ever fails on this call, the `axes` line is the culprit -- the
 * axis names must match what Google Fonts reports. Dropping `axes` builds
 * cleanly but loses the personality, leaving only wght variable.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Phistreams — A studio for creators and founders",
  description:
    "Phistreams builds the business behind the audience, and the audience behind the business. Funnels, operations, identity and scaling. Islamabad.",
  keywords: [
    "creator studio",
    "founder-led content",
    "creator economy",
    "audience and funnel strategy",
    "creator monetization",
    "founder personal brand",
  ],
  openGraph: {
    title: "Phistreams — A studio for creators and founders",
    description:
      "Creators become founders. Founders become creators. Phistreams turns attention into equity.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      {/*
        suppressHydrationWarning here is for browser extensions, not for us.

        Grammarly injects data-new-gr-c-s-check-loaded and data-gr-ext-installed
        onto <body> before React hydrates, so React reports a mismatch on
        attributes this server render never produced. Nothing in this app writes
        to <body> dynamically -- the className above is a static string -- so
        there is no real mismatch for this to hide.

        The attribute only covers THIS element's own attributes and text, not its
        descendants, which is exactly the scope needed. If another extension
        turns up (Dark Reader writes to <html>), that tag needs its own.
      */}
      <body
        suppressHydrationWarning
        className="bg-ink font-sans text-cream antialiased"
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-gold focus:px-5 focus:py-3 focus:text-small focus:font-medium focus:text-ink"
        >
          Skip to content
        </a>
        {children}
        {/* Fixed CRT raster over the whole document, below the nav. */}
        <Scanlines />
        <Analytics />
      </body>
    </html>
  );
}
