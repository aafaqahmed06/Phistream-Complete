import { stats } from "@/lib/content";
import { SplitFlap } from "./motion/SplitFlap";
import { Reveal, RevealGroup, RevealItem } from "./motion/Reveal";
import { Eyebrow } from "./ui/Eyebrow";

export function StatsBand() {
  return (
    <section className="surface-ink section-y">
      <div className="container-x">
        <div className="max-w-[42ch]">
          <Reveal y={16}>
            <Eyebrow tone="on-ink">{stats.eyebrow}</Eyebrow>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="mt-6 font-display text-display-m text-cream">
              {stats.heading}
            </h2>
          </Reveal>
        </div>

        {/* RevealGroup fades the grid in; each SplitFlap then resolves on its
            own in-view trigger. The two overlap into a cascade rather than a
            single synchronised pop. */}
        <RevealGroup className="mt-16 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {stats.items.map((item) => (
            <RevealItem
              key={item.label}
              className="border-t border-taupe/25 pt-8"
            >
              {/* Gold on ink is 6.15:1 -- AA at any size, and this is display
                  size on top of that. */}
              <div className="font-display text-display-m font-light text-gold">
                <SplitFlap text={item.display} />
              </div>
              <div className="mt-4 text-body text-cream">{item.label}</div>
              <div className="mt-1.5 text-small text-taupe">{item.note}</div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
