import { Approach } from "@/components/Approach";
import { CtaBand } from "@/components/CtaBand";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { Nav } from "@/components/Nav";
import { Services } from "@/components/Services";
import { StatsBand } from "@/components/StatsBand";
import { StudioRail } from "@/components/StudioRail";
import { Thinking } from "@/components/Thinking";
import { Work } from "@/components/Work";
import { getHomeContent } from "@/lib/api";
import { showSection } from "@/lib/content";

/** Matches the backend's Cache-Control max-age on public content. */
export const revalidate = 60;

/**
 * Section order is the conversion argument:
 * hook (two paths) -> numbers -> what we do -> how it plays out ->
 * how we think -> who we are -> our thinking -> ask.
 *
 *   ink   ink    cream     ink   cream     ink     ink       cream  ink
 *   hero  stats  services  work  approach  studio  thinking  CTA    footer
 *
 * The stats band and Thinking are hidden until their real content exists --
 * see `showSection` in lib/content.ts.
 *
 * Only the contact email and the socials come from the backend
 * (GET /api/v1/content/home). `home` is null when the API is down, and both
 * then fall back to lib/content.ts.
 */
export default async function Home() {
  const home = await getHomeContent();

  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        {showSection.stats ? <StatsBand /> : null}
        <Services />
        <Work />
        <Approach />
        <StudioRail />
        {showSection.thinking ? <Thinking /> : null}
        <CtaBand email={home?.contact.email} />
      </main>
      <Footer socialLinks={home?.socialLinks} />
    </>
  );
}
