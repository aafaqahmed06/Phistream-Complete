"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { nav } from "@/lib/content-home";
import { Wordmark } from "@/components/ui/Wordmark";

const FOCUSABLE = "a[href], button:not([disabled])";

/**
 * HomeNav — the site's fixed header (the home page and, through SiteChrome, every
 * other public page).
 *
 * Below 600px the links live in a menu panel that behaves like a dialog for
 * keyboard users: opening it moves focus inside, Tab stays inside the header
 * until it closes, and Escape (or choosing a link, or changing page) closes it
 * and hands focus back to the button. The link to the page you are on carries
 * aria-current="page".
 *
 * Does NOT render: status lamp, gold CTA button, ScrollProgress.
 */
export function HomeNav() {
  const pathname = usePathname();
  // The page the menu was opened on: it closes by itself when the page changes.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;

  const headerRef = useRef<HTMLElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback((restoreFocus: boolean) => {
    setOpenAt(null);
    if (restoreFocus) burgerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    // Move focus into the menu.
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
        return;
      }
      if (e.key !== "Tab") return;

      // Keep Tab inside the header while the menu is open.
      const items = Array.from(
        headerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  return (
    <header ref={headerRef} className="pf-nav" role="banner">
      <div className="pf-nav-in">
        {/* Wordmark */}
        <Link href="/#top" className="pf-nav-logo">
          <Wordmark />
        </Link>

        {/* Desktop links (≥600px via container query) */}
        <nav className="pf-nav-links" aria-label="Primary">
          {nav.links.map((link) => {
            const current = link.href === pathname ? "page" : undefined;
            return link.href.startsWith("/") && !link.href.startsWith("/#") ? (
              <Link key={link.href} href={link.href} aria-current={current}>
                {link.label}
              </Link>
            ) : (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            );
          })}
        </nav>

        <Link className="pf-nav-apply" href="/apply">
          Start an application
        </Link>

        {/* Hamburger — below 600px only */}
        <button
          ref={burgerRef}
          type="button"
          className="pf-nav-burger"
          onClick={() => setOpenAt(open ? null : pathname)}
          aria-expanded={open}
          aria-controls="pf-mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            {open ? <path d="M5 5l14 14M19 5L5 19" /> : <path d="M3 8h18M3 16h18" />}
          </svg>
        </button>
      </div>

      {/* Mobile menu panel */}
      {open && (
        <div id="pf-mobile-menu" ref={panelRef} className="pf-nav-mobile">
          <nav aria-label="Mobile">
            {nav.links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="pf-nav-mobile-link"
                aria-current={link.href === pathname ? "page" : undefined}
                onClick={() => close(false)}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
