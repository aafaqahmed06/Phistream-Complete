import { getHomeContent } from "@/lib/api";
import { contactEmail } from "@/lib/content-home";
import { siteUrl } from "@/lib/site";
import { CardStrip } from "@/components/home/CardStrip";
import { HeroStage } from "@/components/home/HeroStage";
import { HomeNav } from "@/components/home/HomeNav";
import { WhatWeDo } from "@/components/home/WhatWeDo";
import { WorkExamples } from "@/components/home/WorkExamples";
import { HowWeWork } from "@/components/home/HowWeWork";
import { StudioTeam } from "@/components/home/StudioTeam";
import { HomeCta } from "@/components/home/HomeCta";
import { Marquee } from "@/components/home/Marquee";
import { HomeFooter } from "@/components/home/HomeFooter";

/**
 * v7 home page assembly (Phase 5).
 * Matches the backend Cache-Control max-age.
 *
 * Stacking: nav z-50 > main z-5 > stage z-0.
 * The 600vh spacer keeps main below the fixed stage; main then slides
 * over the fixed canvas as the user scrolls into it — exactly the preview.
 *
 * Old components (Hero, Services, Work, Approach, StudioRail, CtaBand,
 * Footer, Nav) are unchanged in the repo so inner pages are unaffected.
 */
export const revalidate = 60;

export default async function Home() {
  const home = await getHomeContent();

  // Who the site is about, for search engines: name, address, contact, profiles.
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Phistreams",
    url: siteUrl,
    logo: `${siteUrl}/icon.svg`,
    email: home?.contact.email ?? contactEmail,
    description:
      "A studio for creators and founders. Funnels, operations, identity and scaling.",
    address: { "@type": "PostalAddress", addressLocality: "Islamabad", addressCountry: "PK" },
    ...(home?.socialLinks?.length ? { sameAs: home.socialLinks.map((s) => s.url) } : {}),
  };

  return (
    <div className="pf-root">
      <script
        type="application/ld+json"
        // "<" is escaped so no value can close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization).replace(/</g, "\\u003c") }}
      />
      <HomeNav />
      <HeroStage />
      <CardStrip />
      <div id="pf-spacer" className="pf-spacer" aria-hidden="true" />
      <main id="main" className="pf-main">
        <WhatWeDo />
        <WorkExamples />
        <HowWeWork />
        <StudioTeam />
        <HomeCta email={home?.contact.email ?? undefined} />
        <Marquee />
        <HomeFooter email={home?.contact.email ?? undefined} socialLinks={home?.socialLinks ?? undefined} />
      </main>
    </div>
  );
}
