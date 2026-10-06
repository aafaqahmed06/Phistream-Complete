import { thinking } from "@/lib/content";
import { Reveal } from "./motion/Reveal";
import { Eyebrow } from "./ui/Eyebrow";

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
        <Reveal y={16}>
          <Eyebrow tone="on-ink">{thinking.eyebrow}</Eyebrow>
        </Reveal>
        <Reveal delay={0.08}>
          <h2 className="mt-6 max-w-[24ch] font-display text-display-l text-cream">
            {thinking.heading}
          </h2>
        </Reveal>

        <ul className="mt-14">
          {thinking.items.map((item, i) => (
            // Reveal goes INSIDE the li: a div between ul and li is invalid.
            <li key={item.title} className="border-t border-taupe/25 last:border-b">
              <Reveal delay={i * 0.06} y={16}>
                {/* Not a link until the post exists. */}
                <div className="grid grid-cols-12 items-baseline gap-x-6 gap-y-2 py-8">
                  <span className="col-span-12 font-mono text-eyebrow uppercase text-taupe md:col-span-2">
                    {thinking.soon}
                  </span>

                  <span className="col-span-12 md:col-span-10">
                    <Eyebrow tone="on-ink">{item.category}</Eyebrow>
                    <span className="mt-2 block font-display text-heading text-cream">
                      {item.title}
                    </span>
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
