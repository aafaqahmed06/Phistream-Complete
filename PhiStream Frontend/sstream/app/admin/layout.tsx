import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminSessionProvider } from "@/components/admin/AdminSession";
import { AdminGate } from "@/components/admin/AdminShell";

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
    <AdminSessionProvider>
      <AdminGate>{children}</AdminGate>
    </AdminSessionProvider>
  );
}
