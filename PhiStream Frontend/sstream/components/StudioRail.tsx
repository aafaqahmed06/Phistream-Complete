import { studio } from "@/lib/content";
import { Reveal } from "./motion/Reveal";
import { SectionRule } from "./ui/SectionRule";

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("");
}

/**
 * The team, as a grid of plates.
 *
 * Five people is a number a grid handles better than a scrolling rail: every
 * face is visible at once, nothing is hidden off-screen, and there is no drag
 * handler to maintain. Each plate holds a monogram until portraiture exists --
 * drop an <Image fill sizes="..."/> into the plate and delete the monogram;
 * the aspect ratio and border are already right.
 *
 * Gold on ink is 6.15:1, so the monogram is legible. The plate border is
 * decoration rather than a control boundary, so it is not held to 3:1.
 */
export function StudioRail() {
  return (
    <section id="studio" className="surface-ink section-y">
      <div className="container-x">
        <SectionRule
          label={studio.eyebrow}
          aside={`${String(studio.members.length).padStart(2, "0")} people`}
        />

        <div className="mt-14 grid grid-cols-12 items-end gap-x-8 gap-y-6 md:mt-20">
          <Reveal className="col-span-12 md:col-span-7">
            <h2 className="max-w-[16ch] font-display text-display-l font-light text-cream">
              {studio.heading}
            </h2>
          </Reveal>
          <Reveal
            delay={0.1}
            className="col-span-12 md:col-span-4 md:col-start-9"
          >
            <p className="max-w-[34ch] text-body text-cream/75">
              {studio.lead}
            </p>
          </Reveal>
        </div>

        <ul className="mt-14 grid grid-cols-2 gap-x-5 gap-y-12 sm:grid-cols-3 md:mt-20 lg:grid-cols-5">
          {studio.members.map((member, i) => (
            <li key={member.name}>
              <Reveal delay={i * 0.06} y={16}>
                <figure className="group">
                  <div className="relative aspect-[4/5] overflow-hidden border border-cream/15 bg-cream/[0.03] transition-colors duration-500 group-hover:border-gold/60">
                    <span
                      aria-hidden="true"
                      className="absolute left-4 top-3.5 font-mono text-eyebrow tabular text-taupe"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 flex items-center justify-center font-display text-[clamp(3rem,6vw,5.5rem)] font-light tracking-[-0.03em] text-gold transition-transform duration-700 ease-expo-out group-hover:scale-105"
                    >
                      {initials(member.name)}
                    </span>
                  </div>
                  <figcaption className="mt-5">
                    <div className="font-display text-heading font-normal text-cream">
                      {member.name}
                    </div>
                    <div className="mt-1 font-mono text-eyebrow uppercase text-taupe">
                      {member.role}
                    </div>
                  </figcaption>
                </figure>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
