import Link from "next/link";
import { services } from "@/lib/content";
import { Reveal } from "./motion/Reveal";
import { Button } from "./ui/Button";
import { SectionRule } from "./ui/SectionRule";

/**
 * The six disciplines -- an index, not a grid of cards.
 *
 * Each row is a link to its anchor on /services (the footer already points at
 * the same anchors), so the list is a real table of contents rather than a
 * teaser. On hover a gold-deep rule draws along the row's baseline and the
 * arrow slides in; nothing is hidden behind the hover -- the description is
 * always present, so touch and keyboard users lose nothing.
 *
 * Cream surface: muted text is ink/70 (5.47:1), the index number likewise, and
 * the drawn rule is gold-deep, which is a non-text graphic (3:1 threshold).
 */
export function Services() {
  return (
    <section id="services" className="surface-cream section-y">
      <div className="container-x">
        <SectionRule label={services.eyebrow} tone="on-cream" />

        <div className="mt-14 grid grid-cols-12 gap-x-8 gap-y-14 md:mt-20">
          {/* Sticky rail. Holds position while the rows scroll past it. */}
          <div className="col-span-12 md:col-span-5">
            <div className="md:sticky md:top-32">
              <Reveal>
                <h2 className="max-w-[12ch] font-display text-display-l font-light text-ink">
                  {services.heading}
                </h2>
              </Reveal>
              <Reveal delay={0.1}>
                <p className="mt-6 max-w-[38ch] text-body text-ink/70">
                  {services.lead}
                </p>
              </Reveal>
              <Reveal delay={0.16}>
                <div className="mt-9">
                  <Button href={services.more.href} variant="ghost-light" arrow>
                    {services.more.label}
                  </Button>
                </div>
              </Reveal>
            </div>
          </div>

          <ul className="col-span-12 md:col-span-7">
            {services.items.map((service, i) => (
              // Reveal goes INSIDE the li: a div between ul and li is invalid.
              <li
                key={service.id}
                className="border-t border-ink/20 last:border-b"
              >
                <Reveal delay={i * 0.04} y={12}>
                  <Link
                    href={`/services#${service.slug}`}
                    className="rule-draw group relative grid grid-cols-12 gap-x-6 gap-y-3 py-8 pr-10 md:py-9"
                  >
                    <span className="col-span-2 pt-2 font-mono text-eyebrow tabular text-ink/70 md:col-span-1">
                      {service.id}
                    </span>

                    <h3 className="col-span-10 font-display text-display-m font-light text-ink transition-transform duration-500 ease-expo-out group-hover:translate-x-1.5 md:col-span-11">
                      {service.title}
                    </h3>

                    <p className="col-span-12 max-w-[56ch] text-small text-ink/70 md:col-span-10 md:col-start-2">
                      {service.body}
                    </p>

                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      className="absolute right-0 top-9 h-4 w-4 -translate-x-2 text-ink opacity-0 transition-[opacity,transform] duration-500 ease-expo-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 8h11M9 4l4 4-4 4" />
                    </svg>
                  </Link>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
