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
import { getHomeContent } from "@/lib/api";

/** Matches the backend's Cache-Control max-age on public content. */
export const revalidate = 60;

/**
 * Section order is the conversion argument:
 * hook -> proof of scale -> proof of results -> what we do -> what we made ->
 * how we think -> who we are -> someone else's word -> our thinking -> ask.
 *
 * The ink/cream alternation is structural, not decorative:
 *   ink   cream   ink    cream      ink    cream      ink     cream   ink       cream   ink
 *   hero  ticker  stats  services   work   approach   studio  quote   thinking  CTA     footer
 *
 * Services, the pull quote, the contact email and the socials come from the
 * backend (GET /api/v1/content/home). `home` is null when the API is down,
 * and every section then falls back to its copy in lib/content.ts.
 */
export default async function Home() {
  const home = await getHomeContent();

  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        <TickerBand />
        <StatsBand />
        <Services tiers={home?.services} />
        <Work />
        <Approach />
        <StudioRail />
        <PullQuote testimonial={home?.testimonials[0]} />
        <Thinking />
        <CtaBand email={home?.contact.email} />
      </main>
      <Footer socialLinks={home?.socialLinks} />
    </>
  );
}
