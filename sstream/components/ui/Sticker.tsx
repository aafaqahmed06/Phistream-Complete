import type { ReactNode } from "react";

type Tone = "gold" | "cream" | "ink-outline" | "cream-outline";

type StickerProps = {
  children: ReactNode;
  className?: string;
  tone?: Tone;
};

/**
 * A rotated chip. Used sparingly -- four or five on the whole page -- as the
 * zine/thumbnail punctuation between long stretches of editorial layout.
 *
 * Tone is contrast-locked, same as everywhere else:
 *   gold           ink on #C89B3C      6.15:1    works on ANY surface
 *   cream          ink on #F3EFE6     13.70:1    works on ANY surface
 *   ink-outline    cream text + taupe border     ink surfaces only (5.29:1)
 *   cream-outline  ink text + ink/60 border      cream surfaces only
 *
 * The first two are fills and are therefore surface-independent; the two
 * outlines are not, and pairing one with the wrong surface is a contrast bug
 * rather than a style choice.
 *
 * Rotation is passed in by the caller (e.g. "-rotate-3") rather than baked in,
 * because two stickers at the same angle read as a mistake rather than a motif.
 */
const tones: Record<Tone, string> = {
  gold: "bg-gold text-ink",
  cream: "bg-cream text-ink",
  "ink-outline": "border border-taupe text-cream",
  "cream-outline": "border border-ink/60 text-ink",
};

export function Sticker({
  children,
  className = "",
  tone = "gold",
}: StickerProps) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-mono text-eyebrow uppercase ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
