import { Approach } from "@/components/Approach";
import { CtaBand } from "@/components/CtaBand";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { Nav } from "@/components/Nav";
import { PullQuote } from "@/components/PullQuote";
import { Services } from "@/components/Services";
import { StatsBand } from "@/components/StatsBand";
import { StudioRail } from "@/components/StudioRail";
import { Thinking } from "@/components/Thinking";
import { TickerBand } from "@/components/TickerBand";
import { Work } from "@/components/Work";

/**
 * Section order is the conversion argument:
 * hook -> proof of scale -> proof of results -> what we do -> what we made ->
 * how we think -> who we are -> someone else's word -> our thinking -> ask.
 *
 * The ink/cream alternation is structural, not decorative:
 *   ink   cream   ink    cream      ink    cream      ink     cream   ink       cream   ink
 *   hero  ticker  stats  services   work   approach   studio  quote   thinking  CTA     footer
 */
export default function Home() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        <TickerBand />
        <StatsBand />
        <Services />
        <Work />
        <Approach />
        <StudioRail />
        <PullQuote />
        <Thinking />
        <CtaBand />
      </main>
      <Footer />
    </>
  );
}
