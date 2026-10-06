import type { ReactNode } from "react";

/**
 * The φstreams wordmark: a gold phi leading lowercase "stream" in the display
 * serif, with a gold superscript "s" trailing. Fraunces has no Greek, so the φ
 * falls back to Georgia -- which is a decent phi, so it is left that way.
 *
 * Gold on ink is 6.15:1 -- AA at any size, and the warmest thing in the nav.
 * It only ever appears on ink (nav and footer), which is what keeps it legal:
 * the same gold on cream would be 2.23:1.
 *
 * The glyphs are aria-hidden and the accessible name is supplied once, so a
 * screen reader says "Phistreams" rather than spelling out the styling spans.
 */
export function Wordmark({ className = "", mark = true }: { className?: string; mark?: boolean }) {
  return (
    <span
      className={`inline-flex items-baseline font-display leading-none tracking-[-0.02em] ${className}`}
    >
      <span aria-hidden="true" className="text-gold">
        φ
      </span>
      <span aria-hidden="true">stream</span>
      {mark ? (
        <span
          aria-hidden="true"
          className="ml-[0.06em] self-start text-[0.52em] leading-none text-gold"
        >
          s
        </span>
      ) : null}
      <span className="sr-only">Phistreams</span>
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
