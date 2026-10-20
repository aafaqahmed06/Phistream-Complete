/**
 * ALL copy for the v7 home page. Imports from existing lib/content.ts where
 * the plan says to reuse (A1: service bodies 04-06).
 *
 * Ground rule §1: preview is the spec. This file translates it.
 */

import { services, studio, footer, cta, nav } from "./content";

/* Re-export what the home components need from the shared content */
export { services, studio, footer, cta, nav };

/* -------------------------------------------------------------------------- */
/* Hero captions (tunnel overlay)                                             */
/* -------------------------------------------------------------------------- */

export const heroCaptions = {
  intro: {
    eyebrow: "A studio for creators and founders in Islamabad",
    title: "Creators become founders. Founders become creators.",
    body: "Funnels, operations, identity, and the scaling plan that turns attention into equity.",
  },
  close: {
    eyebrow: "Your move.",
    title: "Tell us what you're building.",
    body: "We'll tell you honestly whether we're the right studio for it.",
    cta: { label: "Apply to work with us", href: "/apply" },
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Service short names: used on 3D cards AND footer link labels               */
/* -------------------------------------------------------------------------- */

/** Short names: used on 3D cards AND footer link labels. */
export const serviceShort = [
  "Identity & Positioning",
  "Audience & Funnel",
  "Monetization",
  "Content & Format",
  "Operations",
  "Scaling",
] as const;

export const serviceCaption = (kk: number) => ({
  eyebrow: `Service ${kk + 1} of 6`,
  title: serviceShort[kk],
  // A1: real copy for all six (services.items[kk].body from lib/content.ts)
  body: services.items[kk].body,
});

/* -------------------------------------------------------------------------- */
/* #what section                                                              */
/* -------------------------------------------------------------------------- */

export const whatWeDo = {
  eyebrow: "01 — What we do",
  heading: "Six things, done properly.",
  lead: "Six disciplines. Built to work in both directions: whether you're building the audience first or the business first.",
  more: services.more,
  // Row titles from preview (§8); bodies A1 from content.ts
  rows: [
    {
      id: "01",
      title: "Identity & Positioning",
      body: services.items[0].body,
    },
    {
      id: "02",
      title: "Audience & Funnel Strategy",
      body: services.items[1].body,
    },
    {
      id: "03",
      title: "Monetization & Commerce",
      body: services.items[2].body,
    },
    {
      id: "04",
      title: "Content & Format",
      body: services.items[3].body,
    },
    {
      id: "05",
      title: "Operations",
      body: services.items[4].body,
    },
    {
      id: "06",
      title: "Scaling",
      body: services.items[5].body,
    },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* #work section                                                              */
/* -------------------------------------------------------------------------- */

export const workExamples = {
  eyebrow: "02 — Examples",
  heading: "Two starting points.",
  sub: "Representative examples of how an engagement runs. Not real client results.",
  chip: "Illustrative",
  items: [
    {
      id: "creator",
      track: "Creator track",
      letter: "C",
      title: "From tutorials to a product line",
      body: "A mid-size creator moves off sponsorship dependency by building a funnel from content into an owned product — identity, offer, and operations built in parallel with the content calendar, not after it.",
      chips: ["Identity", "Funnel", "Product"],
      metric: "revenue per view, not just view count",
      href: "/work/creator",
      accent: "rgba(150,76,55,.62)" as const,
    },
    {
      id: "founder",
      track: "Founder track",
      letter: "F",
      title: "The founder who became the best marketing channel",
      body: "An operator-led company builds its founder's on-camera presence from zero, with a content system the team can run without the founder writing every post — audience becomes a real acquisition channel instead of a vanity project.",
      chips: ["Voice", "System", "Channel"],
      metric: "acquisition cost that falls over time",
      href: "/work/founder",
      accent: "rgba(26,49,91,.9)" as const,
    },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* #approach section                                                          */
/* -------------------------------------------------------------------------- */

export const howWeWork = {
  eyebrow: "03 — How we work",
  heading: "Four steps. No guesswork.",
  // A1: no "[Placeholder copy]" suffix
  sub: "A clear process, so you always know what happens next.",
  steps: [
    {
      n: "01",
      title: "Listen",
      body: "We start with interviews — you, your audience or customers, and the people who already know your work. Direction before tactics.",
    },
    {
      n: "02",
      title: "Map",
      body: "One system, properly built. We map where attention arrives, where it leaks, and what a paying customer's first step should be.",
    },
    {
      n: "03",
      title: "Build",
      body: "The funnel, the offer, the identity — built to work in both directions. We don't start with a content calendar if the real gap is the funnel.",
    },
    {
      n: "04",
      title: "Grow",
      body: "Measure what pays. We agree the number that actually matters before we start and report against it honestly every month.",
    },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* #studio section                                                            */
/* -------------------------------------------------------------------------- */

export const studioSection = {
  // preview says "05 — The studio" (skips 04, as approved — see Q5/§10.9)
  eyebrow: "05 — The studio",
  heading: "Five people. Based in Islamabad.",
  sub: "The people who pitch the work are the people who make it.",
  members: studio.members,
} as const;

/* -------------------------------------------------------------------------- */
/* #contact / CTA section                                                     */
/* -------------------------------------------------------------------------- */

export const contactEmail = cta.email; // "contact@phistream.studio" (A10)

export const ctaSection = {
  eyebrow: "New business",
  heading: "Your move.",
  lead: "Tell us what you're building and what's in the way: a following that doesn't pay yet, or a business nobody's heard of.",
  steps: [
    { n: "01", text: "Tell us what you're building." },
    { n: "02", text: "We review it and tell you honestly if we're the right studio." },
    { n: "03", text: "If we are, you book a call." },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* Marquee (preview order, §4.7)                                             */
/* -------------------------------------------------------------------------- */

// preview order: "Build the business", "Keep the upside", "Post less, mean more", "Own the audience"
export const marqueePhrases = [
  "Build the business",
  "Keep the upside",
  "Post less, mean more",
  "Own the audience",
] as const;

/* -------------------------------------------------------------------------- */
/* Footer                                                                     */
/* -------------------------------------------------------------------------- */

export const footerData = {
  brand: "Phistreams",
  copy: "© 2026 Phistreams, Islamabad",
  columns: [
    {
      title: "Studio",
      links: [
        { label: "About", href: "/#studio" },
        { label: "Careers", href: "/careers" },
        { label: "Contact", href: "/#contact" },
      ],
    },
    {
      title: "Services",
      links: [
        { label: serviceShort[0], href: "/services#identity" },
        { label: serviceShort[1], href: "/services#funnel" },
        { label: serviceShort[2], href: "/services#monetization" },
        { label: serviceShort[3], href: "/services#content" },
        { label: serviceShort[4], href: "/services#operations" },
        { label: serviceShort[5], href: "/services#scaling" },
      ],
    },
    {
      title: "Contact",
      links: [
        { label: contactEmail, href: `mailto:${contactEmail}` },
        { label: "Islamabad", href: null },
      ],
    },
  ],
  legal: [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ],
} as const;
