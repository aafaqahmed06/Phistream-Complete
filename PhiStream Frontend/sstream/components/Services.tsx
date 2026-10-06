import { services } from "@/lib/content";
import { Reveal } from "./motion/Reveal";
import { Button } from "./ui/Button";
import { Eyebrow } from "./ui/Eyebrow";

/**
 * The six disciplines -- a teaser for /services, which goes into deliverables
 * and process per discipline.
 *
 * A list, not a grid of cards.
 *
 * Each row inverts to ink on hover. That inversion is doing two jobs at once:
 * it is the loud beat on an otherwise quiet cream section, and it solves the
 * contrast problem, because cream-on-ink (13.7:1), gold-on-ink (6.15:1) and
 * taupe-on-ink (5.29:1) are all legible whereas the same accents on cream are
 * not.
 *
 * It is an INK fill and not a gold one because the palette note on #C89B3C is
 * "never used for large body backgrounds" -- a full-width hovered row is
 * exactly that. Gold stays where the palette wants it: on the row number and
 * in the rules.
 *
 * Nothing is hidden behind the hover -- the description is always present, so
 * touch and keyboard users lose nothing.
 */
export function Services() {
  return (
    <section id="services" className="surface-cream section-y">
      <div className="container-x">
        <div className="grid grid-cols-12 gap-x-4 md:gap-x-8">
          {/* Sticky rail. Holds position while the rows scroll past it. */}
          <div className="col-span-12 md:col-span-4">
            <div className="md:sticky md:top-32">
              <Reveal y={16}>
                <Eyebrow tone="on-cream">{services.eyebrow}</Eyebrow>
              </Reveal>
              <Reveal delay={0.08}>
                <h2 className="mt-6 font-display text-display-l text-ink">
                  {services.heading}
                </h2>
              </Reveal>
              <Reveal delay={0.14}>
                <p className="mt-6 max-w-[38ch] text-body text-ink/70">
                  {services.lead}
                </p>
              </Reveal>
              <Reveal delay={0.18}>
                <div className="mt-8">
                  <Button href={services.more.href} variant="ghost-light" arrow>
                    {services.more.label}
                  </Button>
                </div>
              </Reveal>
            </div>
          </div>

          <ul className="col-span-12 mt-14 md:col-span-8 md:mt-0">
            {services.items.map((service, i) => (
              // Reveal goes INSIDE the li: a div between ul and li is invalid.
              <li
                key={service.id}
                className="group border-t border-taupe/40 last:border-b"
              >
                <Reveal delay={i * 0.05} y={16}>
                  <div className="-mx-4 grid grid-cols-12 items-baseline gap-x-6 gap-y-3 rounded-xl px-4 py-8 transition-colors duration-300 ease-expo-out group-hover:bg-ink">
                    <span className="col-span-2 font-mono text-eyebrow text-ink/70 transition-colors duration-300 group-hover:text-gold md:col-span-1">
                      {service.id}
                    </span>

                    <h3 className="col-span-10 font-display text-display-m text-ink transition-[color,transform] duration-300 ease-expo-out group-hover:translate-x-1 group-hover:text-cream md:col-span-6">
                      {service.title}
                    </h3>

                    <p className="col-span-12 text-small text-ink/70 transition-colors duration-300 group-hover:text-taupe md:col-span-5">
                      {service.body}
                    </p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
