import type { ReactNode } from "react";

type SectionRuleProps = {
  /** "01 — What we do". The number is split off and set apart. */
  label: string;
  tone?: "on-ink" | "on-cream";
  /** Optional right-hand note, e.g. a count or a location. */
  aside?: ReactNode;
  className?: string;
};

const tones = {
  "on-ink": { rule: "border-cream/20", text: "text-taupe" },
  // ink/70 on cream is 5.47:1; taupe would fail.
  "on-cream": { rule: "border-ink/25", text: "text-ink/70" },
} as const;

/**
 * The line every section opens with: a hairline, then a mono index and label.
 * It is the page's one repeated structural gesture -- the reader learns it on
 * the first section and then reads every later one faster.
 *
 * "01 — What we do" is authored as one string in lib/content.ts; the leading
 * number is pulled out so it can be set in tabular figures on its own.
 */
export function SectionRule({
  label,
  tone = "on-ink",
  aside,
  className = "",
}: SectionRuleProps) {
  const match = /^(\d{2})\s*[—–-]\s*(.+)$/.exec(label);
  const t = tones[tone];

  return (
    <div
      className={`flex items-baseline justify-between gap-6 border-t pt-4 font-mono text-eyebrow uppercase ${t.rule} ${t.text} ${className}`}
    >
      <span className="flex items-baseline gap-4">
        {match ? (
          <>
            <span className="tabular">{match[1]}</span>
            <span>{match[2]}</span>
          </>
        ) : (
          <span>{label}</span>
        )}
      </span>
      {aside ? <span>{aside}</span> : null}
    </div>
  );
}
