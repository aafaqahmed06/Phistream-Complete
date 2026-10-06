import { work } from "@/lib/content";
import { CursorGlow } from "./CursorGlow";
import { Lift } from "./motion/Lift";
import { Reveal } from "./motion/Reveal";
import { Eyebrow } from "./ui/Eyebrow";
import { Sticker } from "./ui/Sticker";

/**
 * Deliberately uneven -- 7/5. Two equal cards is the thing this section exists
 * to not be.
 *
 * Every example is built as a THUMBNAIL: 16:9 plate, corner chips, and a big
 * headline burned across the bottom. It is the format the visitor already
 * reads for a living.
 *
 * With no photography in the build, each plate is generated: an ink ground, a
 * gold radial wash, a faint blueprint grid, and the track's initial ghosted
 * behind it. The wash layer is the thing that scales on hover.
 *
 * The write-up lives in a native <details> panel rather than behind a link:
 * these are illustrative examples, so there is no case-study page to go to.
 */
const spacing = ["md:col-span-7", "md:col-span-5"] as const;

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
            <Reveal delay={0.12}>
              <p className="mt-5 max-w-[52ch] text-small text-taupe">
                {work.disclaimer}
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.14}>
            <Sticker tone="ink-outline" className="-rotate-3">
              {work.sticker}
            </Sticker>
          </Reveal>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-12">
          {work.items.map((item, i) => (
            <Reveal key={item.id} delay={i * 0.06} className={spacing[i] ?? ""}>
              <Lift className="h-full" scale={1.015}>
                <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-taupe/20 bg-ink transition-colors duration-300 hover:border-gold/40">
                  {/* Decorative plate; the text below carries the content. */}
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
                      className="bleed-glyph wonk left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[9rem] text-gold opacity-[0.10]"
                    >
                      {item.track.charAt(0)}
                    </span>

                    {/* Scrim. Thumbnail type sits on top of generated art, so it
                        needs its own ground to guarantee contrast. */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-ink via-ink/85 to-transparent"
                    />

                    {/* The plate repeats the title and track below, so it is
                        hidden from the a11y tree rather than read twice. */}
                    <span
                      aria-hidden="true"
                      className="absolute left-3 top-3 rounded-md bg-ink/85 px-2 py-1 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-cream"
                    >
                      {item.track}
                    </span>
                    <span
                      aria-hidden="true"
                      className="absolute right-3 top-3 rounded-md bg-ink/85 px-2 py-1 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-cream"
                    >
                      {work.chip}
                    </span>

                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 p-4 font-display text-xl font-semibold leading-[0.98] text-cream md:p-5 md:text-2xl"
                    >
                      {item.title}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-6">
                    <Eyebrow tone="on-ink">
                      {item.track} · {work.chip}
                    </Eyebrow>

                    <h3 className="mb-6 mt-4 font-display text-heading text-cream">
                      {item.title}
                    </h3>

                    <details className="group/details mt-auto border-t border-taupe/25 pt-5">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-small font-medium text-gold [&::-webkit-details-marker]:hidden">
                        {work.open}
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 16 16"
                          className="h-3.5 w-3.5 transition-transform duration-300 group-open/details:rotate-90"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2 8h11M9 4l4 4-4 4" />
                        </svg>
                      </summary>
                      <p className="mt-4 max-w-[48ch] text-small text-cream/80">
                        {item.body}
                      </p>
                      <p className="mt-4 text-small text-taupe">
                        {work.metricLabel}:{" "}
                        <span className="text-gold">{item.metric}</span>
                      </p>
                    </details>
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
