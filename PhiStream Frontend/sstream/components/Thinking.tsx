import { thinking } from "@/lib/content";
import { Reveal } from "./motion/Reveal";
import { Eyebrow } from "./ui/Eyebrow";

/**
 * An editorial list rather than a three-card blog grid. The rows are dense and
 * left-aligned so the section reads like a contents page.
 *
 * This is an INK surface, so the hover cannot be a background inversion the way
 * it is in Services -- an ink row on an ink section is nothing at all. The move
 * here is type instead: the headline and the arrow warm to gold, which is
 * 6.15:1 on ink and the loudest thing the palette allows on a dark ground.
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
            <li key={item.date} className="group border-t border-taupe/25 last:border-b">
              <Reveal delay={i * 0.06} y={16}>
                <a
                  href="#"
                  className="grid grid-cols-12 items-baseline gap-x-6 gap-y-2 py-8 transition-colors duration-300"
                >
                  <time
                    dateTime={item.date}
                    className="col-span-12 font-mono text-eyebrow text-taupe transition-colors duration-300 group-hover:text-gold md:col-span-2"
                  >
                    {item.dateLabel}
                  </time>

                  <span className="col-span-11 md:col-span-7">
                    <Eyebrow
                      tone="on-ink"
                      className="transition-colors duration-300 group-hover:text-gold"
                    >
                      {item.category}
                    </Eyebrow>
                    <span className="mt-2 block font-display text-heading text-cream transition-colors duration-300 group-hover:text-gold">
                      {item.title}
                    </span>
                  </span>

                  <span className="col-span-1 flex justify-end md:col-span-3 md:justify-end">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      className="h-4 w-4 text-taupe transition-[transform,color] duration-300 ease-expo-out group-hover:translate-x-1 group-hover:text-gold"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 8h11M9 4l4 4-4 4" />
                    </svg>
                  </span>
                </a>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
