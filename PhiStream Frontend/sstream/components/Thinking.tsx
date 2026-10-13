import { thinking } from "@/lib/content";
import { Reveal } from "./motion/Reveal";
import { SectionRule } from "./ui/SectionRule";

/**
 * An editorial list rather than a three-card blog grid. The rows are dense and
 * left-aligned so the section reads like a contents page.
 *
 * The posts are not written yet, so rows are plain text with no hover or arrow
 * -- nothing here should look clickable until it goes somewhere.
 */
export function Thinking() {
  return (
    <section id="thinking" className="surface-ink section-y">
      <div className="container-x">
        <SectionRule label={thinking.eyebrow} />

        <Reveal>
          <h2 className="mt-14 max-w-[20ch] font-display text-display-l font-light text-cream md:mt-20">
            {thinking.heading}
          </h2>
        </Reveal>

        <ul className="mt-16">
          {thinking.items.map((item, i) => (
            // Reveal goes INSIDE the li: a div between ul and li is invalid.
            <li key={item.title} className="border-t border-cream/15 last:border-b">
              <Reveal delay={i * 0.06} y={12}>
                {/* Not a link until the post exists. */}
                <div className="grid grid-cols-12 items-baseline gap-x-8 gap-y-3 py-8">
                  <span className="col-span-12 font-mono text-eyebrow uppercase text-taupe md:col-span-2">
                    {item.category}
                  </span>

                  <span className="col-span-12 font-display text-heading font-normal text-cream md:col-span-8">
                    {item.title}
                  </span>

                  <span className="col-span-12 font-mono text-eyebrow uppercase text-taupe md:col-span-2 md:text-right">
                    {thinking.soon}
                  </span>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
