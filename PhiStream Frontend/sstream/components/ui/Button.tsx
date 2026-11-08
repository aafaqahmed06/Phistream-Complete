import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "gold" | "terra" | "ghost-dark" | "ghost-light";

type ButtonProps = {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
  /** Trailing arrow that slides on hover. */
  arrow?: boolean;
};

/**
 * One primary action per surface, so there is one rule to learn:
 *
 *   gold         for DARK surfaces. bg #E9B44C + text #14213D, AA at
 *                any size. Hover flips to cream + ink (13.1:1).
 *
 *   terra        for LIGHT surfaces (cream or white). bg #FF6B5B + ink text.
 *                Hover flips to ink and cream, matching the closing call to
 *                action on the home page.
 *
 *   ghost-dark   for dark surfaces. cream 13.1:1 idle, gold 6.22:1 on hover.
 *                Border is full taupe (5.35:1 on ink): at /50 it computes to
 *                about 2.4:1 and a button outline is a UI component, so the 3:1
 *                threshold applies.
 *
 *   ghost-light  for light surfaces. Text stays ink (13.1:1). Border is ink at
 *                60% (4.0:1 on cream); at /25 it would be about 1.7:1 and fail
 *                the 3:1 UI-component threshold.
 *
 * Previously the primary button was always gold with a hard offset shadow, which
 * is 2.1:1 against a cream page. The shadow is gone and the colour now follows
 * the surface.
 */
const variants: Record<Variant, string> = {
  gold: "bg-gold text-ink hover:bg-cream active:translate-y-px",
  terra: "bg-terra text-ink hover:bg-ink hover:text-cream active:translate-y-px",
  "ghost-dark":
    "border border-taupe text-cream hover:border-gold hover:text-gold",
  "ghost-light":
    "border border-ink/60 text-ink hover:border-terra hover:bg-terra/10",
};

export function Button({
  href,
  children,
  variant = "gold",
  className = "",
  arrow = false,
}: ButtonProps) {
  // In-site paths ("/apply", "/#contact") navigate client-side; mailto:,
  // bare "#" anchors and external URLs stay plain links.
  const Anchor = href.startsWith("/") ? Link : "a";

  return (
    <Anchor
      href={href}
      className={`group inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-small font-medium transition-[background-color,color,border-color,transform] duration-200 ease-expo-out ${variants[variant]} ${className}`}
    >
      {children}
      {arrow ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5 transition-transform duration-300 ease-expo-out group-hover:translate-x-1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 8h11M9 4l4 4-4 4" />
        </svg>
      ) : null}
    </Anchor>
  );
}
