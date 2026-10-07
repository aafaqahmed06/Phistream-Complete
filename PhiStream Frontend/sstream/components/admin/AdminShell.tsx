"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { Page } from "@/lib/admin/api";
import { LiveDot, Wordmark } from "@/components/ui/Wordmark";
import { useAdminData, useAdminSession } from "./AdminSession";
import { NotConfigured, SignIn } from "./SignIn";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/emails", label: "Emails" },
  { href: "/admin/activity", label: "Activity" },
] as const;

/**
 * The control room frame. An ink rail -- the wordmark only ever sits on ink,
 * as on the site -- beside a cream workspace, because reading lists and
 * answers is cream work. The gate decides what renders: the sign-in door,
 * a setup note, or the workspace.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { status } = useAdminSession();

  if (status === "unconfigured") return <NotConfigured />;
  if (status === "signed-out") return <SignIn />;
  if (status === "unreachable") return <Unreachable />;
  if (status === "loading") {
    return (
      <main id="main" className="surface-ink flex min-h-svh items-center justify-center">
        <span className="inline-flex items-center gap-3 font-mono text-eyebrow uppercase text-taupe">
          <LiveDot className="text-gold" />
          Opening the control room
        </span>
      </main>
    );
  }
  return <Shell>{children}</Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { email, signOut } = useAdminSession();
  // Applications waiting for a first look: the one count worth a badge.
  const waiting = useAdminData<Page<unknown>>("/applications?status=NEW&limit=1");
  const newCount = waiting.data?.pagination.total ?? 0;

  const isCurrent = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const links = NAV.map((item) => (
    <li key={item.href}>
      <Link
        href={item.href}
        aria-current={isCurrent(item.href) ? "page" : undefined}
        className={`group flex items-center justify-between gap-3 rounded-full px-4 py-2.5 text-small transition-colors ${
          isCurrent(item.href)
            ? "bg-cream text-ink"
            : "text-cream/80 hover:text-gold"
        }`}
      >
        {item.label}
        {item.href === "/admin/applications" && newCount > 0 ? (
          <span
            className="rounded-full bg-gold px-2 py-0.5 font-mono text-eyebrow text-ink"
            aria-label={`${newCount} new`}
          >
            {newCount}
          </span>
        ) : null}
      </Link>
    </li>
  ));

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[16.5rem_1fr]">
      {/* Rail: sticky on desktop, a top bar on small screens. */}
      <aside className="surface-ink border-b border-taupe/25 lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-4 px-5 pb-4 pt-5 lg:block lg:px-6 lg:pt-8">
          <Link href="/admin" className="text-2xl text-cream transition-colors hover:text-gold">
            <Wordmark />
          </Link>
          <span className="inline-flex items-center gap-2 font-mono text-eyebrow uppercase text-taupe lg:mt-4 lg:flex">
            <LiveDot className="text-gold" />
            Control room
          </span>
        </div>

        <nav aria-label="Control room" className="px-3 lg:mt-8">
          <ul className="no-scrollbar flex gap-1 overflow-x-auto pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
            {links}
          </ul>
        </nav>

        <div className="hidden border-t border-taupe/25 px-6 py-6 lg:mt-auto lg:block">
          <p className="truncate text-small text-cream" title={email ?? undefined}>
            {email}
          </p>
          <div className="mt-3 flex items-center gap-5 text-small">
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-cream/80 underline decoration-cream/30 underline-offset-4 transition-colors hover:text-gold hover:decoration-gold"
            >
              Sign out
            </button>
            <Link href="/" className="text-cream/80 transition-colors hover:text-gold">
              View site
            </Link>
          </div>
        </div>
      </aside>

      <main id="main" className="surface-cream min-w-0">
        {children}
        {/* Small screens: account controls live at the foot of the page. */}
        <div className="flex items-center justify-between gap-4 border-t border-taupe/40 px-5 py-6 text-small lg:hidden">
          <span className="truncate text-ink/70">{email}</span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="shrink-0 text-ink underline decoration-ink/40 underline-offset-4"
          >
            Sign out
          </button>
        </div>
      </main>
    </div>
  );
}

/** The server didn't answer; the session is intact, so offer a retry, not a sign-in. */
function Unreachable() {
  const { problem, retry, signOut } = useAdminSession();
  return (
    <main id="main" className="surface-ink min-h-svh">
      <div className="container-x flex min-h-svh flex-col justify-center py-16">
        <Wordmark className="text-2xl text-cream" />
        <h1 className="mt-14 max-w-[20ch] font-display text-display-m font-light text-cream">
          The control room can&apos;t reach the server.
        </h1>
        <p className="mt-6 max-w-[52ch] text-body text-cream/80">
          {problem} You&apos;re still signed in.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-6">
          <button
            type="button"
            onClick={() => void retry()}
            className="rounded-full bg-gold px-6 py-3 text-small font-medium text-ink shadow-[3px_3px_0_0_var(--color-cream)] transition-colors hover:bg-cream"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-small text-cream/80 underline decoration-cream/30 underline-offset-4 hover:text-gold"
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}

/** Consistent page padding inside the workspace. */
export function Workspace({ children }: { children: ReactNode }) {
  return <div className="px-5 py-10 sm:px-8 lg:px-12 lg:py-14">{children}</div>;
}
