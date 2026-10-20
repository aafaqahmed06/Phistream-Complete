import type { ReactNode } from "react";

/**
 * The wordmark: a gold φ and "Phistreams", the same lockup as the site header.
 *
 * Gold on ink is 6.22:1, AA at any size. It only ever appears on ink; the same
 * gold on cream would be 2.11:1.
 *
 * The φ is aria-hidden and the accessible name is the word beside it, so a
 * screen reader says "Phistreams" once.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-[0.3em] leading-none ${className}`}>
      <span aria-hidden="true" className="text-gold" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
        φ
      </span>
      <span>Phistreams</span>
    </span>
  );
}

/** Large decorative φ for section bleeds. Purely presentational. */
export function GlyphWatermark({
  className = "",
  children = "φ",
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span aria-hidden="true" className={`bleed-glyph select-none ${className}`}>
      {children}
    </span>
  );
}

/**
 * The dot that says something is live. Purely decorative -- the text beside it
 * always carries the meaning, so it is never announced twice.
 *
 * It inherits `currentColor`, so the caller picks a colour that is legal on
 * whatever surface it lands on: gold on ink, gold-deep on cream.
 */
export function LiveDot({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-2 w-2 shrink-0 ${className}`}
    >
      <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
    </span>
  );
}
