import { work } from "@/lib/content";
import { CursorGlow } from "./CursorGlow";
import { Lift } from "./motion/Lift";
import { Reveal } from "./motion/Reveal";
import { Button } from "./ui/Button";
import { Eyebrow } from "./ui/Eyebrow";
import { Sticker } from "./ui/Sticker";

/**
 * Deliberately uneven -- 7/5 then 5/7, mirrored. A uniform 2x2 grid of equal
 * cards is the thing this section exists to not be.
 *
 * Every case study is built as a THUMBNAIL: 16:9 plate, a duration chip and a
 * view count in the corners, and a big punchy headline burned across the
 * bottom. It is the format the visitor already reads for a living, so the
 * section lands as familiar before they have read a word of it.
 *
 * With no photography in the build, each plate is generated: an ink ground, a
 * gold radial wash, a faint blueprint grid, and the client's initial ghosted
 * behind it. The wash layer is the thing that scales on hover, so the plate
 * zooms like a poster without the type moving at all.
 */
const spacing = [
  "md:col-span-7",
  "md:col-span-5",
  "md:col-span-5",
  "md:col-span-7",
] as const;

const accents: Record<string, string> = {
  "top-left":
    "bg-[radial-gradient(ellipse_at_top_left,rgba(200,155,60,0.22),transparent_58%)]",
  "top-right":
    "bg-[radial-gradient(ellipse_at_top_right,rgba(200,155,60,0.22),transparent_58%)]",
  "bottom-left":
    "bg-[radial-gradient(ellipse_at_bottom_left,rgba(200,155,60,0.22),transparent_58%)]",
  "bottom-right":
    "bg-[radial-gradient(ellipse_at_bottom_right,rgba(200,155,60,0.22),transparent_58%)]",
};

const BLUEPRINT =
  "[background-image:linear-gradient(to_right,rgba(243,239,230,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(243,239,230,0.35)_1px,transparent_1px)] [background-size:2.5rem_2.5rem]";

export function Work() {
  return (
    <section id="work" className="surface-ink section-y relative isolate">
      {/* Sits behind everything and lights the plates as the cursor moves
          across them. Direct child of the section, which is what it measures. */}
      <CursorGlow />

      <div className="container-x relative z-10">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <div>
            <Reveal y={16}>
              <Eyebrow tone="on-ink">{work.eyebrow}</Eyebrow>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-6 font-display text-display-l text-cream">
                {work.heading}
              </h2>
            </Reveal>
          </div>

          <Reveal delay={0.14} className="flex items-center gap-5">
            <Sticker tone="ink-outline" className="-rotate-3">
              {work.sticker}
            </Sticker>
            <Button href="#contact" variant="ghost-dark" arrow>
              See all work
            </Button>
          </Reveal>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-12">
          {work.items.map((item, i) => (
            <Reveal key={item.id} delay={i * 0.06} className={spacing[i] ?? ""}>
              <Lift className="h-full" scale={1.015}>
                <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-taupe/20 bg-ink transition-colors duration-300 hover:border-gold/40">
                  {/*
                    The plate is the link. The meta below stays plain text, so
                    selecting the case-study copy still works -- a stretched link
                    over the whole card would kill text selection to buy a
                    bigger click target that is not worth it.
                  */}
                  <div className="relative aspect-video shrink-0 overflow-hidden">
                    <span
                      aria-hidden="true"
                      className={`absolute -inset-[6%] transition-transform duration-700 ease-expo-out group-hover:scale-105 ${accents[item.accent] ?? ""}`}
                    />

                    <span
                      aria-hidden="true"
                      className={`absolute inset-0 opacity-[0.07] ${BLUEPRINT}`}
                    />

                    <span
                      aria-hidden="true"
                      className="bleed-glyph wonk left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[9rem] text-gold opacity-[0.10] transition-opacity duration-500 group-hover:opacity-0"
                    >
                      {item.creator.charAt(0)}
                    </span>

                    {/* Scrim. Thumbnail type sits on top of generated art, so it
                        needs its own ground to guarantee contrast. */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-ink via-ink/85 to-transparent"
                    />

                    <span className="absolute left-3 top-3 rounded-md bg-ink/85 px-2 py-1 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-cream">
                      {item.chipLeft}
                    </span>
                    <span className="absolute right-3 top-3 rounded-md bg-ink/85 px-2 py-1 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-cream">
                      {item.chipRight}
                    </span>

                    <span className="absolute inset-x-0 bottom-0 p-4 font-display text-xl font-semibold leading-[0.98] text-cream md:p-5 md:text-2xl">
                      {item.thumbTitle}
                    </span>

                    {/* Poster -> affordance. The arrow only exists on hover,
                        which is what makes the first hover feel like the plate
                        woke up. */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    >
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold text-ink shadow-[3px_3px_0_0_var(--color-ink)]">
                        <svg
                          viewBox="0 0 16 16"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2 8h11M9 4l4 4-4 4" />
                        </svg>
                      </span>
                    </span>

                    {/*
                      A link laid OVER the plate, rather than wrapping it. If the
                      plate's contents were inside the <a>, the thumbnail text and
                      both corner chips would all concatenate into the link's
                      accessible name -- "Read the Maya Ellison case study 12:04
                      1.9M views She Quit Sponsorships". As a sibling overlay, the
                      link gets one clean name and the plate's text stays in the
                      a11y tree as content.
                    */}
                    <a href="#" className="absolute inset-0">
                      <span className="sr-only">
                        Read the {item.creator} case study
                      </span>
                    </a>
                  </div>

                  <div className="flex flex-1 flex-col p-6">
                    <Eyebrow tone="on-ink">{item.sector}</Eyebrow>

                    <h3 className="mt-4 font-display text-heading text-cream">
                      {item.creator}
                    </h3>
                    <p className="mt-3 max-w-[42ch] text-small text-cream/80">
                      {item.result}
                    </p>

                    <div className="mt-auto flex items-baseline gap-3 border-t border-taupe/25 pt-5">
                      <span className="font-display text-3xl text-gold">
                        {item.metric}
                      </span>
                      <span className="text-small text-taupe">
                        {item.metricLabel}
                      </span>
                    </div>
                  </div>
                </article>
              </Lift>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
