import { cta } from "@/lib/content";
import { ContactForm } from "./ContactForm";
import { Reveal } from "./motion/Reveal";
import { Button } from "./ui/Button";
import { SectionRule } from "./ui/SectionRule";
import { LiveDot } from "./ui/Wordmark";

/**
 * The close.
 *
 * One line, set at display-2xl -- the largest type on the page by a wide
 * margin -- with the operative word in the gold-deep italic. It is short on
 * purpose: "Your move." is the only string on the site that is both the loudest
 * thing on screen and four syllables long. Gold-deep on cream is 4.38:1, which
 * clears AA for large text, and this is as large as text gets here.
 */
export function CtaBand({ email }: { email?: string | null }) {
  // The backend's public contact.email wins over the static fallback.
  const contactEmail = email || cta.email;

  return (
    <section id="contact" className="surface-cream section-y">
      <div className="container-x">
        <SectionRule
          label={cta.eyebrow}
          tone="on-cream"
          aside={
            <span className="inline-flex items-center gap-2">
              <LiveDot className="text-gold-deep" />
              {cta.sticker}
            </span>
          }
        />

        <Reveal>
          <h2 className="mt-14 font-display text-display-2xl font-light text-ink md:mt-20">
            Your <span className="accent-deep">move.</span>
          </h2>
        </Reveal>

        <div className="mt-16 grid grid-cols-12 gap-x-8 gap-y-14 md:mt-24">
          <div className="col-span-12 lg:col-span-5">
            <Reveal delay={0.1}>
              <p className="max-w-[44ch] text-body-l text-ink/70">{cta.body}</p>
            </Reveal>

            <Reveal delay={0.18}>
              <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
                <Button href={cta.button.href} arrow>
                  {cta.button.label}
                </Button>
                <a
                  href={`mailto:${contactEmail}`}
                  className="text-small text-ink underline decoration-ink/40 decoration-1 underline-offset-4 transition-colors hover:decoration-ink"
                >
                  {contactEmail}
                </a>
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
