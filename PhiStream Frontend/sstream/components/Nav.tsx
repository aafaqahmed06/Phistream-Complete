"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { nav as navContent } from "@/lib/content";
import { ScrollProgress } from "./ScrollProgress";
import { Wordmark, LiveDot } from "./ui/Wordmark";
import { Button } from "./ui/Button";

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
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled || open
          ? "border-b border-taupe/25 bg-ink/90 backdrop-blur-md"
          : "border-b border-transparent"
      }`}
    >
      <nav
        aria-label="Primary"
        className="container-x flex h-20 items-center justify-between gap-6"
      >
        <div className="flex items-center">
          <Link
            href="/#top"
            className="py-2 text-xl text-cream transition-colors hover:text-gold"
          >
            <Wordmark />
          </Link>

          {/* The status lamp. Gold on an ink bar, 6.15:1. */}
          <span className="ml-4 hidden items-center gap-2 font-mono text-eyebrow uppercase text-taupe sm:inline-flex">
            <LiveDot className="text-gold" />
            {navContent.status}
          </span>
        </div>

        <ul className="hidden items-center gap-9 md:flex">
          {navContent.links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-small text-cream/80 transition-colors duration-200 hover:text-gold"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden md:block">
          <Button href={navContent.cta.href}>{navContent.cta.label}</Button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-cream transition-colors hover:text-gold md:hidden"
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            {open ? (
              <path d="M5 5l14 14M19 5L5 19" />
            ) : (
              <path d="M3 8h18M3 16h18" />
            )}
          </svg>
        </button>
      </nav>

      {open ? (
        <div
          id="mobile-menu"
          className="border-t border-taupe/25 bg-ink md:hidden"
        >
          <ul className="container-x flex flex-col py-4">
            {navContent.links.map((link, i) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="group flex items-baseline gap-4 border-b border-taupe/15 py-4 transition-colors hover:text-gold"
                >
                  <span className="font-mono text-eyebrow text-taupe">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-display text-2xl text-cream group-hover:text-gold">
                    {link.label}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <div className="container-x pb-8 pt-2">
            <Button href={navContent.cta.href} className="w-full" arrow>
              {navContent.cta.label}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Always over ink: transparent over the ink hero, solid ink once
          scrolled. That is what makes gold safe for it. */}
      <ScrollProgress />
    </header>
  );
}
