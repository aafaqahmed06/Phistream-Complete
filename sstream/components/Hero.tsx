import { Fragment } from "react";
import { hero } from "@/lib/content";
import { Button } from "./ui/Button";
import { Eyebrow } from "./ui/Eyebrow";
import { GlyphWatermark } from "./ui/Wordmark";

/** Static level meter on the hero rail. Decorative -- the text carries meaning. */
const WAVE = [6, 13, 4, 18, 9, 15, 5, 20, 8, 11, 6, 17, 10, 7, 14, 5];

/**
 * The hero.
 *
 * The headline reveals WORD BY WORD, the way burned-in captions land, and the
 * last word lands in a tilted gold block -- a sticker rather than a
 * highlighter stroke. That tilt is the entire tonal argument of the page: the
 * sentence is set in a light, expensive serif, and the word that matters is
 * wearing a gold label.
 *
 * All of it is CSS, not Motion, on purpose. This headline is almost certainly
 * the LCP element, and a CSS animation starts at first paint while a Motion
 * variant has to wait for hydration. Nothing above the fold may wait on
 * hydration to become visible.
 */
export function Hero() {
  // A running word index across both lines, so the caption stagger is
  // continuous instead of restarting at every line break.
  let n = 0;
  const delays = hero.headline.lines.map((line) =>
    line.map(() => 0.12 + n++ * 0.055)
  );

  return (
    <section
      id="top"
      className="surface-ink grain relative isolate overflow-hidden"
    >
      {/*
        The Ø bleeds off the right edge. Rotation is what stops it reading as a
        logo pasted into the corner -- it is a texture, not a mark.
      */}
      <GlyphWatermark className="-right-[10vw] top-1/2 -translate-y-1/2 rotate-12 text-[50vw] text-gold opacity-[0.06]" />

      {/* Vertical credentials rail. Long-form studios put their numbers on a
          masthead spine; it costs one line of rotated type and makes the hero
          feel like a plate rather than a landing page. */}
      <div className="absolute right-[clamp(1.25rem,4vw,4rem)] top-1/2 hidden -translate-y-1/2 xl:block">
        <span className="font-mono text-eyebrow uppercase text-taupe [writing-mode:vertical-rl]">
          412M views · 68 creators · 11 years
        </span>
      </div>

      <div className="container-x relative z-10 flex min-h-[92svh] flex-col justify-center pb-16 pt-36">
        {/* Asymmetric on purpose: pushed left, no max-width fighting the
            explicit line breaks. A centred hero is the single strongest tell of
            a generated template. */}
        <div>
          <div className="rise" style={{ animationDelay: "0.05s" }}>
            <Eyebrow tone="gold-on-ink">{hero.eyebrow}</Eyebrow>
          </div>

          <h1 className="mt-8 font-display text-display-xl font-light text-cream">
            {hero.headline.lines.map((line, li) => (
              <span key={li} className="rise-line">
                {line.map((word, wi) => (
                  <Fragment key={wi}>
                    <span
                      className={`rise-word ${word.highlight ? "pop-word" : ""}`}
                      style={{ animationDelay: `${delays[li][wi]}s` }}
                    >
                      {word.highlight ? (
                        <span className={`highlight ${word.wonk ? "wonk" : ""}`}>
                          {word.t}
                        </span>
                      ) : (
                        <span className={word.wonk ? "wonk" : undefined}>
                          {word.t}
                        </span>
                      )}
                    </span>{" "}
                  </Fragment>
                ))}
              </span>
            ))}
          </h1>

          <p
            className="rise mt-10 max-w-[46ch] text-body-l text-cream/80"
            style={{ animationDelay: "0.58s" }}
          >
            {hero.lead}
          </p>

          <div
            className="rise mt-10 flex flex-wrap items-center gap-4"
            style={{ animationDelay: "0.68s" }}
          >
            <Button href={hero.primaryCta.href} arrow>
              {hero.primaryCta.label}
            </Button>
            <Button href={hero.secondaryCta.href} variant="ghost-dark">
              {hero.secondaryCta.label}
            </Button>
          </div>
        </div>
      </div>

      {/* Baseline rail: grounds the hero and gives the scroll cue somewhere to
          sit. The meter pulses on staggered delays -- opacity only, so it costs
          nothing to composite, and reduced motion freezes it at full. */}
      <div className="container-x relative z-10">
        <div className="flex items-center justify-between gap-6 border-t border-taupe/25 py-6">
          <Eyebrow tone="on-ink">{hero.scrollCue}</Eyebrow>

          <span
            aria-hidden="true"
            className="flex h-5 items-center gap-[3px]"
          >
            {WAVE.map((h, i) => (
              <span
                key={i}
                className="w-[2px] animate-pulse rounded-full bg-gold"
                style={{ height: h, animationDelay: `${i * 110}ms` }}
              />
            ))}
          </span>

          <Eyebrow tone="on-ink">{hero.est}</Eyebrow>
        </div>
      </div>
    </section>
  );
}
