import type { Metadata } from "next";
import { DM_Sans, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Fraunces carries the typographic identity. The public site runs it at SOFT 0 /
 * WONK 0 with automatic optical sizing -- sharp, high-contrast and calm at
 * display sizes, sturdier in small headings. The italic is the one emphasis
 * device (see .accent in globals.css). The SOFT and WONK axes stay loaded
 * because the staff admin area still uses them.
 *
 * If the build ever fails on this call, the `axes` line is the culprit -- the
 * axis names must match what Google Fonts reports.
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
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-[2px] focus:bg-gold focus:px-5 focus:py-3 focus:text-small focus:font-medium focus:text-ink"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
