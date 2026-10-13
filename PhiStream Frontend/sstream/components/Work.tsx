import Link from "next/link";
import { work } from "@/lib/content";
import { Reveal } from "./motion/Reveal";
import { FunnelPlate, SignalPlate } from "./ui/Plates";
import { SectionRule } from "./ui/SectionRule";

/**
 * Two engagements, laid out as case-study cards over a generated diagram.
 *
 * Deliberately uneven -- 7/5 -- so the pair reads as editorial layout rather
 * than a pricing table. Each plate is a small diagram of what the engagement is
 * about (see ui/Plates.tsx): attention narrowing into an owned product for the
 * creator track, one source radiating outward for the founder track.
 *
 * Each card is a single link (the title link is stretched over the whole
 * card), so the entire surface is the click target.
 *
 * The examples are ILLUSTRATIVE, not client results, and the page says so --
 * the disclaimer under the heading and the label on every plate. Swap in real
 * work once it exists.
 */
const spacing = ["md:col-span-7", "md:col-span-5"] as const;

const plates: Record<string, typeof FunnelPlate> = {
  creator: FunnelPlate,
  founder: SignalPlate,
};

export function Work() {
  return (
    <section id="work" className="surface-ink section-y relative">
      <div className="container-x">
        <SectionRule label={work.eyebrow} aside={work.chip} />

        <div className="mt-14 grid grid-cols-12 items-end gap-x-8 gap-y-6 md:mt-20">
          <Reveal className="col-span-12 md:col-span-7">
            <h2 className="max-w-[14ch] font-display text-display-l font-light text-cream">
              {work.heading}
            </h2>
          </Reveal>
          <Reveal
            delay={0.1}
            className="col-span-12 md:col-span-4 md:col-start-9"
          >
            <p className="max-w-[40ch] text-small text-taupe">
              {work.disclaimer}
            </p>
          </Reveal>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 md:mt-20 md:grid-cols-12">
          {work.items.map((item, i) => {
            const Plate = plates[item.id] ?? FunnelPlate;
            return (
              <Reveal
                key={item.id}
                delay={i * 0.08}
                className={spacing[i] ?? ""}
              >
                <article className="group relative flex h-full flex-col border border-cream/15 transition-colors duration-500 hover:border-gold/60">
                  <div className="relative aspect-[16/9] overflow-hidden border-b border-cream/15 bg-cream/[0.03]">
                    <Plate className="absolute inset-0 h-full w-full transition-transform duration-[1200ms] ease-expo-out group-hover:scale-[1.03]" />
                    <span
                      aria-hidden="true"
                      className="absolute left-5 top-4 font-mono text-eyebrow uppercase text-taupe"
                    >
                      {item.track}
                    </span>
                    <span
                      aria-hidden="true"
                      className="absolute right-5 top-4 font-mono text-eyebrow tabular uppercase text-taupe"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-6 md:p-8">
                    <h3 className="font-display text-display-m font-light text-cream">
                      <Link
                        href={`/work/${item.id}`}
                        className="after:absolute after:inset-0 focus-visible:outline-none"
                      >
                        {item.title}
                        <span className="sr-only">
                          {" "}
                          — {item.track}, {work.chip.toLowerCase()}
                        </span>
                      </Link>
                    </h3>

                    <p className="mt-5 max-w-[52ch] text-small text-cream/75">
                      {item.body}
                    </p>

                    <div className="mt-auto pt-8">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-cream/15 pt-5">
                        <span className="font-mono text-eyebrow uppercase text-taupe">
                          {work.metricLabel}
                        </span>
                        <span className="text-small text-gold">
                          {item.metric}
                        </span>
                      </div>

                      <span
                        aria-hidden="true"
                        className="mt-5 inline-flex items-center gap-2.5 text-small font-medium text-cream transition-colors duration-300 group-hover:text-gold"
                      >
                        {work.open}
                        <svg
                          viewBox="0 0 16 16"
                          className="h-3.5 w-3.5 transition-transform duration-500 ease-expo-out group-hover:translate-x-1.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2 8h11M9 4l4 4-4 4" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
