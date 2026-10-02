import type { ReactNode } from "react";

type EyebrowProps = {
  children: ReactNode;
  className?: string;
  /**
   * Which surface this label sits on. The palette's muted colours are NOT
   * interchangeable: taupe on ink is 5.29:1 and reads fine, but taupe on cream
   * is 2.59:1 and fails, and gold on cream is 2.23:1 and fails.
   *
   * There is deliberately no "on-gold" tone. ink/70 over a gold fill computes
   * to 3.53:1, which fails at this size, so a label on gold has to be full ink
   * -- write `text-ink` inline rather than adding a tone that would only ever
   * be wrong.
   */
  tone?: "on-ink" | "on-cream" | "gold-on-ink";
};

const tones: Record<NonNullable<EyebrowProps["tone"]>, string> = {
  "on-ink": "text-taupe",
  "on-cream": "text-ink/70",
  "gold-on-ink": "text-gold",
};

export function Eyebrow({
  children,
  className = "",
  tone = "on-ink",
}: EyebrowProps) {
  return (
    <span
      className={`block font-mono text-eyebrow uppercase ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
