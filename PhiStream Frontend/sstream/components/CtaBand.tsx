import { cta } from "@/lib/content";
import { ContactForm } from "./ContactForm";
import { Reveal } from "./motion/Reveal";
import { Button } from "./ui/Button";
import { Eyebrow } from "./ui/Eyebrow";
import { Sticker } from "./ui/Sticker";
import { GlyphWatermark } from "./ui/Wordmark";

/**
 * The drop.
 *
 * One line, set at display-2xl -- the largest type on the page by a wide
 * margin -- with the operative word in a gold block. It is short on purpose:
 * "Your move." is the only string on this site that is both the loudest thing
 * on screen and four syllables long.
 */
export function CtaBand({ email }: { email?: string | null }) {
  // The backend's public contact.email wins over the static fallback.
  const contactEmail = email || cta.email;

  return (
    <section
      id="contact"
      className="surface-cream section-y relative isolate overflow-hidden"
    >
      {/*
        Gold as a decorative wash. On cream it is a warm tint rather than a
        shape, and the ink headline keeps its 13.7:1.
      */}
      <GlyphWatermark className="-left-[14vw] top-1/2 -translate-y-1/2 -rotate-12 text-[54vw] text-gold opacity-[0.12]" />

      <div className="container-x relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <Reveal y={16}>
            <Eyebrow tone="on-cream">{cta.eyebrow}</Eyebrow>
          </Reveal>
          <Reveal y={16} delay={0.06}>
            <Sticker tone="gold" className="rotate-2">
              {cta.sticker}
            </Sticker>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <h2 className="mt-8 font-display text-display-2xl font-light text-ink">
            Your <span className="highlight wonk">move.</span>
          </h2>
        </Reveal>

        <div className="mt-10 grid grid-cols-12 gap-x-4 md:gap-x-8 gap-y-12">
          <div className="col-span-12 lg:col-span-5">
            <Reveal delay={0.18}>
              <p className="max-w-[48ch] text-body-l text-ink/70">{cta.body}</p>
            </Reveal>

            <Reveal delay={0.26}>
              <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-5">
                <Button href={`mailto:${contactEmail}`}>
                  {contactEmail}
                </Button>
              </div>
            </Reveal>
          </div>

          {/* Not wrapped in Reveal: a form that is invisible until scrolled
              into view is a form someone tabbing through can land in blind. */}
          <div className="col-span-12 lg:col-span-6 lg:col-start-7">
            <ContactForm />
          </div>
        </div>
      </div>
    </section>
  );
}
