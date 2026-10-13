import { approach } from "@/lib/content";
import { Reveal } from "./motion/Reveal";
import { SectionRule } from "./ui/SectionRule";

/**
 * Four principles in four columns, each under its own rule. The rule is the
 * only hover affordance: it draws in gold-deep, nothing moves.
 *
 * Cream surface: body text is ink/70 (5.47:1) and the index is ink/70 too --
 * gold-deep on cream is 4.38:1, which fails at this size.
 */
export function Approach() {
  return (
    <section id="approach" className="surface-cream section-y">
      <div className="container-x">
        <SectionRule label={approach.eyebrow} tone="on-cream" />

        <Reveal>
          <h2 className="mt-14 max-w-[20ch] font-display text-display-l font-light text-ink md:mt-20">
            {approach.heading}
          </h2>
        </Reveal>

        <ol className="mt-16 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:mt-24 lg:grid-cols-4">
          {approach.principles.map((principle, i) => (
            // Reveal goes INSIDE the li: a div between ol and li is invalid.
            <li
              key={principle.id}
              className="rule-draw rule-draw-top border-t border-ink/25 pt-6"
            >
              <Reveal delay={i * 0.08} y={16}>
                <span className="font-mono text-eyebrow tabular text-ink/70">
                  {principle.id}
                </span>
                <h3 className="mt-8 font-display text-heading font-normal text-ink">
                  {principle.title}
                </h3>
                <p className="mt-4 max-w-[34ch] text-small text-ink/70">
                  {principle.body}
                </p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
