import type { PublicTestimonial } from "@/lib/api";
import { quote as staticQuote } from "@/lib/content";
import { Reveal } from "./motion/Reveal";

/** The first live testimonial when the backend has one, else the static quote. */
export function PullQuote({
  testimonial,
}: {
  testimonial?: PublicTestimonial;
}) {
  const quote = testimonial
    ? {
        text: testimonial.quote,
        attribution: testimonial.name,
        org: [testimonial.role, testimonial.company].filter(Boolean).join(", "),
      }
    : staticQuote;

  return (
    <section className="surface-cream section-y">
      <div className="container-x">
        <Reveal>
          <figure className="grid grid-cols-12 gap-x-8 gap-y-10">
            {/* 8 of 12 columns, left-aligned. Centring this would flatten it
                into the same shape as every other section on the page. */}
            <div className="col-span-12 md:col-span-8">
              <blockquote className="font-display text-display-l text-ink">
                <span aria-hidden="true" className="mr-3 text-gold-deep">
                  {"“"}
                </span>
                <span className="wonk italic">{quote.text}</span>
              </blockquote>
            </div>

            <figcaption className="col-span-12 self-end md:col-span-3 md:col-start-10">
              {/* gold-deep rather than gold: a 4px gold rule on cream is
                  2.23:1 and barely reads as a rule at all. gold-deep is
                  4.38:1, which is the palette's cream-safe accent. */}
              <div className="border-t-4 border-gold-deep pt-5 text-small">
                <div className="text-ink">{quote.attribution}</div>
                {quote.org ? (
                  <div className="mt-1 text-ink/70">{quote.org}</div>
                ) : null}
              </div>
            </figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
