import { ticker } from "@/lib/content";
import { Eyebrow } from "./ui/Eyebrow";
import { Ticker } from "./ui/Ticker";
import { LiveDot } from "./ui/Wordmark";

/**
 * The client crawl.
 *
 * A full-bleed strip with an ink crawl running across it, whose speed is driven
 * by how fast the visitor is scrolling -- see Ticker.tsx.
 *
 * It is CREAM, not a field of gold, and that is a brand rule rather than a taste
 * call: the palette note on #C89B3C is "never used for large body backgrounds".
 * Gold earns its place here as the hairline rules, the live lamp and the Ø
 * separators instead, while the crawl itself stays ink at 13.7:1.
 */
export function TickerBand() {
  return (
    <section className="surface-cream relative overflow-hidden border-y border-gold/40 py-12 md:py-14">
      <div className="container-x">
        <div className="flex items-center gap-3">
          {/* gold-deep, not gold: a 2px lamp at 2.23:1 would be invisible on
              cream. gold-deep is 4.38:1 and is the palette's cream accent. */}
          <LiveDot className="text-gold-deep" />
          <Eyebrow tone="on-cream">{ticker.label}</Eyebrow>
        </div>
      </div>

      {/* Full-bleed on purpose: the crawl should run off both edges of the
          viewport rather than sit politely inside the container. */}
      <Ticker items={ticker.names} className="mt-7" />
    </section>
  );
}
