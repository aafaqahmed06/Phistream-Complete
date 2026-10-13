import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "gold" | "ghost-dark" | "ghost-light";
type Size = "md" | "sm";

type ButtonProps = {
  href: string;
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
  /** Trailing arrow that slides on hover. */
  arrow?: boolean;
};

/**
 * Square-cornered, with a fill that rises from the bottom edge on hover. One
 * mechanism for all three variants: a ::before panel slides up behind the label
 * and the label changes colour to stay legible on it.
 *
 * Contrast -- these pairings are not stylistic preferences:
 *
 *   gold         bg #C89B3C + text #2B211A = 6.15:1 AA at any size, on EITHER
 *                surface. Hover raises an INK panel under cream text (13.7:1)
 *                inside a gold ring, which reads on ink (the ring does the
 *                work) and on cream (the fill does).
 *
 *   ghost-dark   for ink surfaces. cream 13.7:1 idle; border is full taupe
 *                (5.29:1) because a button outline is a UI component and needs
 *                3:1 -- at /50 it would be 2.36:1. Hover raises a gold panel
 *                under ink text (6.15:1).
 *
 *   ghost-light  for cream surfaces. ink text 13.7:1; border is ink at 60%
 *                (4.04:1 on cream). Hover raises an ink panel under cream text.
 */
const variants: Record<Variant, string> = {
  gold: "bg-gold text-ink ring-1 ring-gold before:bg-ink hover:text-cream",
  "ghost-dark":
    "text-cream ring-1 ring-taupe before:bg-gold hover:text-ink hover:ring-gold",
  "ghost-light":
    "text-ink ring-1 ring-ink/60 before:bg-ink hover:text-cream hover:ring-ink",
};

const sizes: Record<Size, string> = {
  md: "px-6 py-3.5 text-small",
  sm: "px-4 py-2.5 text-small",
};

export function Button({
  href,
  children,
  variant = "gold",
  size = "md",
  className = "",
  arrow = false,
}: ButtonProps) {
  // In-site paths ("/apply", "/#contact") navigate client-side; mailto:,
  // bare "#" anchors and external URLs stay plain links.
  const Anchor = href.startsWith("/") ? Link : "a";

  return (
    <Anchor
      href={href}
      className={`group relative isolate inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-[2px] font-medium tracking-[0.005em] transition-[color,box-shadow] duration-500 ease-expo-out before:absolute before:inset-0 before:-z-10 before:translate-y-full before:transition-transform before:duration-500 before:ease-expo-out hover:before:translate-y-0 ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
      {arrow ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5 transition-transform duration-500 ease-expo-out group-hover:translate-x-1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 8h11M9 4l4 4-4 4" />
        </svg>
      ) : null}
    </Anchor>
  );
}
