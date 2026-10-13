import { stats } from "@/lib/content";
import { SplitFlap } from "./motion/SplitFlap";
import { Reveal, RevealGroup, RevealItem } from "./motion/Reveal";
import { SectionRule } from "./ui/SectionRule";

/** Hidden until real figures exist -- see `showSection.stats`. */
export function StatsBand() {
  return (
    <section className="surface-ink section-y">
      <div className="container-x">
        <SectionRule label={stats.eyebrow} />

        <Reveal>
          <h2 className="mt-14 max-w-[28ch] font-display text-display-m font-light text-cream md:mt-20">
            {stats.heading}
          </h2>
        </Reveal>

        {/* RevealGroup fades the grid in; each SplitFlap then resolves on its
            own in-view trigger. The two overlap into a cascade rather than a
            single synchronised pop. */}
        <RevealGroup className="mt-16 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {stats.items.map((item) => (
            <RevealItem
              key={item.label}
              className="border-t border-cream/20 pt-8"
            >
              {/* Gold on ink is 6.15:1 -- AA at any size. */}
              <div className="font-display text-display-m font-light text-gold">
                <SplitFlap text={item.display} />
              </div>
              <div className="mt-4 text-body text-cream">{item.label}</div>
              <div className="mt-1.5 font-mono text-eyebrow uppercase text-taupe">
                {item.note}
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
