import Link from "next/link";
import { Fragment } from "react";
import { hero } from "@/lib/content";
import { Eyebrow } from "./ui/Eyebrow";
import { GoldenConstruction } from "./ui/GoldenConstruction";

/**
 * The hero.
 *
 * Composition, top to bottom: a meta line, the headline, and -- pinned to the
 * foot of the viewport -- the lead paragraph beside the two doors into the
 * studio. Behind all of it, four hairline columns and the golden construction:
 * the same structure the rest of the page is built on, drawn once, large.
 *
 * Each headline line rises out of its own mask. All of it is CSS, not Motion,
 * on purpose: this headline is almost certainly the LCP element, and a CSS
 * animation starts at first paint while a Motion variant has to wait for
 * hydration. Nothing above the fold may wait on hydration to become visible.
 */
export function Hero() {
  // Lines enter on a stagger, after the construction has started to draw.
  const lineDelay = (i: number) => `${0.15 + i * 0.14}s`;

  return (
    <section
      id="top"
      className="surface-ink relative isolate overflow-hidden"
    >
      <div className="grid-rules" aria-hidden="true">
        <div>
          <div>
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>

      <GoldenConstruction className="pointer-events-none absolute -right-[18vw] bottom-[6svh] -z-10 w-[118vw] max-w-none md:-right-[6vw] md:bottom-auto md:top-[16svh] md:w-[62vw]" />

      <div className="container-x relative z-10 flex min-h-[100svh] flex-col pb-10 pt-28 md:pt-36">
        <div
          className="fade-up flex items-baseline justify-between gap-6"
          style={{ animationDelay: "0.05s" }}
        >
          <Eyebrow tone="gold-on-ink">{hero.eyebrow}</Eyebrow>
          <div className="hidden md:block">
            <Eyebrow tone="on-ink">{hero.rail}</Eyebrow>
          </div>
        </div>

        <h1 className="mt-10 font-display text-display-xl font-light text-cream md:mt-16">
          {hero.headline.lines.map((line, li) => (
            <span key={li} className="line-mask">
              <span style={{ animationDelay: lineDelay(li) }}>
                {line.map((word, wi) => (
                  <Fragment key={wi}>
                    {word.highlight ? (
                      <span className="accent">{word.t}</span>
                    ) : (
                      word.t
                    )}
                    {wi < line.length - 1 ? " " : null}
                  </Fragment>
                ))}
              </span>
            </span>
          ))}
        </h1>

        <div className="mt-auto grid grid-cols-12 gap-x-8 gap-y-12 pt-20 md:pt-28">
          <p
            className="fade-up col-span-12 max-w-[40ch] text-body-l text-cream/75 lg:col-span-4"
            style={{ animationDelay: "0.7s" }}
          >
            {hero.lead}
          </p>

          {/* Two doors into the same studio. Each is one link, so the whole
              cell is the click target; the gold rule draws along its top edge
              on hover and focus. */}
          <ul
            className="fade-up col-span-12 grid md:grid-cols-2 lg:col-span-8"
            style={{ animationDelay: "0.85s" }}
          >
            {hero.paths.map((path, i) => (
              <li key={path.label}>
                <Link
                  href={path.cta.href}
                  className={`rule-draw rule-draw-top rule-draw-gold group flex h-full flex-col border-t border-cream/20 py-7 md:py-8 ${
                    i === 0
                      ? "md:border-r md:pr-10"
                      : "md:pl-10"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-4">
                    <Eyebrow tone="gold-on-ink">{path.label}</Eyebrow>
                    <span
                      aria-hidden="true"
                      className="font-mono text-eyebrow tabular text-taupe"
                    >
                      {i === 0 ? "A" : "B"}
                    </span>
                  </span>
                  <span className="mt-5 block font-display text-display-m font-light text-cream">
                    {path.headline}
                  </span>
                  <span className="mt-4 block max-w-[44ch] text-small text-cream/70">
                    {path.body}
                  </span>
                  <span className="mt-7 inline-flex items-center gap-2.5 text-small font-medium text-gold">
                    {path.cta.label}
                    <svg
                      aria-hidden="true"
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
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="fade-in mt-14 grid grid-cols-2 items-center gap-4 border-t border-cream/15 pt-5 md:grid-cols-3"
          style={{ animationDelay: "1.2s" }}
        >
          <Eyebrow tone="on-ink">{hero.scrollCue} ↓</Eyebrow>
          <div className="hidden text-center md:block">
            <Eyebrow tone="on-ink">{hero.coords}</Eyebrow>
          </div>
          <Eyebrow tone="on-ink" className="text-right">
            {hero.est}
          </Eyebrow>
        </div>
      </div>
    </section>
  );
}
