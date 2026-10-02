import { approach } from "@/lib/content";
import { Reveal } from "./motion/Reveal";
import { Eyebrow } from "./ui/Eyebrow";

export function Approach() {
  return (
    <section id="approach" className="surface-cream section-y">
      <div className="container-x">
        <div className="grid grid-cols-12 gap-x-8 gap-y-16">
          <div className="col-span-12 md:col-span-5">
            <div className="md:sticky md:top-32">
              <Reveal y={16}>
                <Eyebrow tone="on-cream">{approach.eyebrow}</Eyebrow>
              </Reveal>
              <Reveal delay={0.08}>
                <h2 className="mt-6 font-display text-display-l text-ink">
                  {approach.heading}
                </h2>
              </Reveal>
            </div>
          </div>

          <ol className="col-span-12 md:col-span-6 md:col-start-7">
            {approach.principles.map((principle, i) => (
              // Reveal goes INSIDE the li: a div between ol and li is invalid,
              // and the first: variants must target the li itself.
              <li
                key={principle.id}
                className="group border-t border-taupe/40 py-9 first:border-t-0 first:pt-0"
              >
                <Reveal delay={i * 0.06} y={20}>
                  <div className="flex items-baseline gap-5">
                    {/* The number fills with gold on hover -- ink on gold is
                        6.15:1, so the marker gets more legible, not less. The
                        ring itself is decoration and is not held to the 3:1
                        UI-component threshold. */}
                    <span className="flex h-7 w-7 shrink-0 translate-y-1 items-center justify-center rounded-full border border-ink/25 font-mono text-eyebrow text-ink/70 transition-colors duration-300 group-hover:border-gold group-hover:bg-gold group-hover:text-ink">
                      {principle.id}
                    </span>
                    <h3 className="font-display text-heading text-ink">
                      {principle.title}
                    </h3>
                  </div>
                  <p className="mt-4 max-w-[52ch] text-body text-ink/70 md:pl-12">
                    {principle.body}
                  </p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
