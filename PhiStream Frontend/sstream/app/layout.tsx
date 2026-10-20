import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import { siteUrl } from "@/lib/site";
import "./globals.css";
import "./home.css";

/**
 * The site's one type family. Newsreader stands in for Freight Text Pro (not
 * licensed for self-hosting); the font stack names Freight first so it is used
 * where installed. No italic, matching the approved preview. The control
 * room's own fonts are loaded in app/admin/layout.tsx, so public visitors never
 * download them.
 */
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  // Pages give a short title; the template adds the name once.
  title: {
    default: "Phistreams — A studio for creators and founders",
    template: "%s — Phistreams",
  },
  applicationName: "Phistreams",
  // "./" resolves against metadataBase to each page's own URL.
  alternates: { canonical: "./" },
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
    siteName: "Phistreams",
    locale: "en_US",
  },
  // The share image comes from app/opengraph-image.png; Twitter falls back to it.
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable}`}
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
      </body>
    </html>
  );
}
