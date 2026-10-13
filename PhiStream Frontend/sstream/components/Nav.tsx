"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { nav as navContent } from "@/lib/content";
import { ScrollProgress } from "./ScrollProgress";
import { Wordmark, LiveDot } from "./ui/Wordmark";
import { Button } from "./ui/Button";

/**
 * Fixed header. Transparent over the hero, then a solid ink bar with a hairline
 * once the page has moved. Always over ink, which is what makes the gold
 * wordmark and progress bar legal.
 *
 * Desktop: wordmark and status on the left, links and the one call to action on
 * the right. Mobile: a full-height panel with the links set large in the display
 * face -- the same list, given room.
 */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the panel on Escape, and stop the page scrolling behind it.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500 ${
        scrolled || open
          ? "border-b border-cream/15 bg-ink/90 backdrop-blur-md"
          : "border-b border-transparent"
      }`}
    >
      <nav
        aria-label="Primary"
        className="container-x flex h-[4.5rem] items-center justify-between gap-6"
      >
        <div className="flex items-center gap-5">
          <Link
            href="/#top"
            className="py-2 text-[1.375rem] text-cream transition-opacity hover:opacity-80"
          >
            <Wordmark />
          </Link>

          <span className="hidden items-center gap-2 border-l border-cream/20 pl-5 font-mono text-eyebrow uppercase text-taupe lg:inline-flex">
            <LiveDot className="text-gold" />
            {navContent.status}
          </span>
        </div>

        <div className="hidden items-center gap-10 md:flex">
          <ul className="flex items-center gap-8">
            {navContent.links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="group relative inline-block py-2 text-small text-cream/80 transition-colors duration-300 hover:text-cream"
                >
                  {link.label}
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0.5 h-px origin-left scale-x-0 bg-gold transition-transform duration-500 ease-expo-out group-hover:scale-x-100"
                  />
                </a>
              </li>
            ))}
          </ul>
          <Button href={navContent.cta.href} size="sm" arrow>
            {navContent.cta.label}
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="-mr-2 flex h-11 w-11 items-center justify-center text-cream transition-colors hover:text-gold md:hidden"
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            {open ? (
              <path d="M5 5l14 14M19 5L5 19" />
            ) : (
              <path d="M3 9h18M3 15h18" />
            )}
          </svg>
        </button>
      </nav>

      {open ? (
        <div
          id="mobile-menu"
          // Absolute, not fixed: the header's backdrop-filter makes it the
          // containing block for fixed descendants, so "fixed" would size the
          // panel to the 72px bar instead of the viewport.
          className="absolute inset-x-0 top-full h-[calc(100svh-4.5rem)] overflow-y-auto border-t border-cream/15 bg-ink md:hidden"
        >
          <ul className="container-x flex flex-col pt-6">
            {navContent.links.map((link, i) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="group flex items-baseline gap-5 border-b border-cream/15 py-5 transition-colors"
                >
                  <span className="font-mono text-eyebrow tabular text-taupe">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-display text-[2rem] font-light leading-none tracking-[-0.02em] text-cream transition-colors group-hover:text-gold">
                    {link.label}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <div className="container-x pb-10 pt-8">
            <Button href={navContent.cta.href} className="w-full" arrow>
              {navContent.cta.label}
            </Button>
          </div>
        </div>
      ) : null}

      <ScrollProgress />
    </header>
  );
}
