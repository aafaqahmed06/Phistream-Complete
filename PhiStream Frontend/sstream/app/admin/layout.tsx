import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { AdminSessionProvider } from "@/components/admin/AdminSession";
import { AdminGate } from "@/components/admin/AdminShell";

/** Control-room-only fonts: loaded here, so public pages never download them. */
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

/**
 * /admin is the studio's back office: none of the marketing chrome (nav,
 * footer, cursor glow), and kept out of search engines. Everything inside is
 * client-rendered from the staff-only API, so no private data is ever baked
 * into a cached page.
 */
export const metadata: Metadata = {
  title: { default: "Control room — Phistreams", template: "%s — Control room" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`admin-scope ${dmSans.variable} ${jetbrainsMono.variable}`}>
      <AdminSessionProvider>
        <AdminGate>{children}</AdminGate>
      </AdminSessionProvider>
    </div>
  );
}
