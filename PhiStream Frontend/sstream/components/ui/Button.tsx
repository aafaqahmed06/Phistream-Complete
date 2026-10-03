import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "gold" | "ghost-dark" | "ghost-light";

type ButtonProps = {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
  /** Trailing arrow that slides on hover. */
  arrow?: boolean;
};

/**
 * Contrast note -- these variants are not stylistic preferences:
 *
 *   gold         bg #C89B3C + text #2B211A = 6.15:1 AA at any size, and it is
 *                the one pairing that works on ink AND on cream, so the primary
 *                action looks identical no matter which surface it lands on.
 *                Hover flips to cream + ink = 13.7:1 with a gold-deep ring
 *                (4.38:1 on cream, 3.13:1 on ink -- both clear the 3:1
 *                UI-component threshold), so the button gets MORE legible on
 *                interaction rather than less. The hard offset shadow is ink,
 *                so it simply disappears on ink sections instead of going
 *                muddy.
 *
 *   ghost-dark   for ink surfaces. cream 13.7:1 idle, gold 6.15:1 on hover.
 *                Border is full taupe (5.29:1 on ink) -- at /50 it computes to
 *                2.36:1 and a button outline is a UI component, so the 3:1
 *                threshold applies and it would fail.
 *
 *   ghost-light  for cream surfaces. text stays ink (13.7:1) because gold-deep
 *                on cream is only 4.38:1 and would fail at this text size. Only
 *                the border warms to gold-deep. Border is ink at 60% (4.04:1 on
 *                cream); at /25 it computes to 1.65:1 and fails the 3:1
 *                UI-component threshold.
 */
const variants: Record<Variant, string> = {
  gold: "bg-gold text-ink shadow-[3px_3px_0_0_var(--color-ink)] ring-1 ring-transparent hover:bg-cream hover:ring-gold-deep hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-ink)] active:translate-y-0 active:shadow-[2px_2px_0_0_var(--color-ink)]",
  "ghost-dark":
    "border border-taupe text-cream hover:border-gold hover:text-gold",
  "ghost-light":
    "border border-ink/60 text-ink hover:border-gold-deep hover:bg-gold/10",
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
      className={`group inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-small font-medium transition-[background-color,color,border-color,box-shadow,transform,translate] duration-200 ease-expo-out ${variants[variant]} ${className}`}
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
