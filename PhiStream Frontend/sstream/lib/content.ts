/**
 * Every string on the page lives here. Sections import from this file so copy
 * can be revised without touching layout, and so the voice stays consistent.
 *
 * The voice: a studio that works for people who already have an audience. It
 * talks like the creator's own team, not like an agency pitching them. Short
 * sentences. Concrete nouns. No "solutions", no "leverage", no "at scale".
 */

/* -------------------------------------------------------------------------- */
/* Nav                                                                        */
/* -------------------------------------------------------------------------- */

export const nav = {
  /** Pairs with the pulsing dot. The studio's whole pitch in two words. */
  status: "On air",
  links: [
    { label: "Work", href: "/#work" },
    { label: "Services", href: "/#services" },
    { label: "Studio", href: "/#studio" },
    { label: "Thinking", href: "/#thinking" },
  ],
  cta: { label: "Apply to work with us", href: "/apply" },
} as const;

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The headline is authored as WORDS, not lines of prose, because it reveals
 * word by word like burned-in captions -- see Hero.tsx and the .rise-word /
 * .pop-word keyframes. A line is a hard break; a word is one animated span.
 */
export type HeroWord = {
  t: string;
  /** Rendered inside a gold block. Ink on gold, 6.15:1. */
  highlight?: boolean;
  /** Swaps in the eccentric WONK letterforms. */
  wonk?: boolean;
};
export type HeroLine = HeroWord[];

const heroLines: HeroLine[] = [
  [{ t: "You" }, { t: "built" }, { t: "the" }, { t: "audience." }],
  [
    { t: "Now" },
    { t: "build" },
    { t: "the" },
    { t: "business.", highlight: true, wonk: true },
  ],
];

export const hero = {
  eyebrow: "A studio for creators — London / New York",
  headline: { lines: heroLines },
  lead: "Strategy, formats, partnerships and the team that makes them. Østreams turns channels into companies — and keeps the upside on your side of the table.",
  primaryCta: { label: "Book a strategy call", href: "/#contact" },
  secondaryCta: { label: "See the work", href: "/#work" },
  scrollCue: "Scroll",
  est: "Est. 2015",
} as const;

/* -------------------------------------------------------------------------- */
/* Ticker band                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Replaces the old logo marquee. The names crawl past on a cream strip, and
 * the crawl reacts to how fast you are scrolling -- see Ticker.tsx.
 */
export const ticker = {
  label: "Currently on the roster",
  names: [
    "Maya Ellison",
    "The Long Game",
    "Corner Office",
    "Halcyon Sounds",
    "Northwind",
    "Kestrel",
    "Ardent",
    "Lumen Group",
    "Salt & Stone",
    "Meridian",
    "Beacon",
    "Foundry Nine",
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* Stats                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `display` is the literal string the split-flap counter lands on, so the
 * symbol, the grouping and the unit are all authored here rather than being
 * reassembled from a number at render time.
 */
export const stats = {
  eyebrow: "The receipts",
  heading: "Views are easy. These are the numbers we actually get judged on.",
  items: [
    {
      display: "412M",
      label: "Views across client channels",
      note: "Last 12 months, all platforms",
    },
    {
      display: "68",
      label: "Creators on the roster",
      note: "From 40k to 12M followers",
    },
    {
      display: "£94M",
      label: "Creator revenue influenced",
      note: "Deals, product and memberships",
    },
    {
      display: "11",
      label: "Years in the feed",
      note: "Since before this was an industry",
    },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* Services                                                                   */
/* -------------------------------------------------------------------------- */

export const services = {
  eyebrow: "01 — What we do",
  heading: "Six things, done properly.",
  lead: "We are not a full-service agency and we do not want to be. Six disciplines, staffed by people who have done nothing else for a decade.",
  /**
   * Used instead of heading/lead when the list comes from the backend's
   * service tiers (GET /content/home), whose count and wording are data.
   */
  live: {
    heading: "Ways to work with us.",
    lead: "Every engagement is staffed by people who have done nothing else for a decade. Pick the shape that fits, or tell us and we will suggest one.",
    priceOnRequest: "Price on request",
  },
  items: [
    {
      id: "01",
      title: "Brand & Positioning",
      body: "Who you are when the camera is off. The one-sentence answer to 'so what do you actually do?' — built to survive outside your own feed.",
    },
    {
      id: "02",
      title: "Audience Strategy",
      body: "Format, cadence and hook discipline. The difference between reach and a relationship, measured on the graph that shows both.",
    },
    {
      id: "03",
      title: "Brand Partnerships",
      body: "Deals that do not cost you the audience that made you worth booking. We read the contract and the room.",
    },
    {
      id: "04",
      title: "Content Studio",
      body: "Editors, producers and shooters who already live in the format. The team behind the uploads, on your side of the table.",
    },
    {
      id: "05",
      title: "Product & Commerce",
      body: "Merch, courses, memberships, apps. Revenue that does not reset to zero every time you post.",
    },
    {
      id: "06",
      title: "Channel Ops",
      body: "The unglamorous engine: pipeline, contracts, analytics, and someone who finally answers your email on a Tuesday.",
    },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* Work                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Case studies are built as THUMBNAILS -- the format the visitor already reads
 * for a living. `thumbTitle` is the big text burned onto the plate, the way it
 * would be on a real thumbnail; `chipLeft` / `chipRight` are the corner stamps
 * (duration and view count, or their platform-native equivalents).
 */
export const work = {
  eyebrow: "02 — Selected work",
  heading: "Four we can talk about.",
  sticker: "Recently shipped",
  items: [
    {
      id: "maya",
      creator: "Maya Ellison",
      sector: "Beauty · 2.4M subscribers",
      thumbTitle: "She Quit Sponsorships",
      chipLeft: "12:04",
      chipRight: "1.9M views",
      result:
        "Moved a tutorial channel off ad revenue and into a skincare line that outsells it.",
      metric: "38×",
      metricLabel: "revenue per view",
      /** Drives the generated plate gradient -- see Work.tsx */
      accent: "top-left",
    },
    {
      id: "longgame",
      creator: "The Long Game",
      sector: "Podcast · Business",
      thumbTitle: "Six Weeks To A Rate Card",
      chipLeft: "41:22",
      chipRight: "2.1M plays",
      result:
        "Rebuilt a hobby interview show as a media brand, then sold the first ad tier before the season ended.",
      metric: "9.4M",
      metricLabel: "downloads in year one",
      accent: "bottom-right",
    },
    {
      id: "corneroffice",
      creator: "Corner Office",
      sector: "Newsletter · Careers",
      thumbTitle: "41,000 People Pay To Read This",
      chipLeft: "8 min read",
      chipRight: "62% open rate",
      result:
        "Turned a free newsletter into a paid product without burning the list that built it.",
      metric: "41k",
      metricLabel: "paying subscribers",
      accent: "top-right",
    },
    {
      id: "halcyon",
      creator: "Halcyon Sounds",
      sector: "Music · Creator commerce",
      thumbTitle: "The Label The Fans Already Owned",
      chipLeft: "16:38",
      chipRight: "770k views",
      result:
        "Launched an artist-owned label and a first drop to an audience that already trusted them.",
      metric: "£3.1M",
      metricLabel: "first-year merch revenue",
      accent: "bottom-left",
    },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* Approach                                                                   */
/* -------------------------------------------------------------------------- */

export const approach = {
  eyebrow: "03 — How we work",
  heading: "We would rather be right than fast. Usually we manage both.",
  principles: [
    {
      id: "01",
      title: "Audience before algorithm",
      body: "You already know how to get watched. We plan for the platform after this one — the one where the audience belongs to you.",
    },
    {
      id: "02",
      title: "Own the relationship",
      body: "Followers are rented. We build the list, the product and the thing that leaves with you when the feed changes its mind.",
    },
    {
      id: "03",
      title: "One upload, properly made",
      body: "One idea made well beats a calendar full of filler. Restraint is a strategy, not a budget line.",
    },
    {
      id: "04",
      title: "Measure what pays",
      body: "Views are a delivery metric. We agree the number that actually matters before we start, and we report against it honestly.",
    },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* Studio                                                                     */
/* -------------------------------------------------------------------------- */

export const studio = {
  eyebrow: "04 — The studio",
  heading: "Twenty-nine people. No account layer.",
  lead: "The people who pitch the work are the people who make it. Drag sideways to meet a few of them.",
  members: [
    { name: "Ada Okonkwo", role: "Founding Partner, Strategy" },
    { name: "Marcus Reid", role: "Partner, Creator Partnerships" },
    { name: "Yuki Tanaka", role: "Creative Director" },
    { name: "Priya Raman", role: "Head of Formats" },
    { name: "Tomás Ferreira", role: "Editorial Director" },
    { name: "Nadia Haddad", role: "Head of Commerce" },
    { name: "Sam Whitfield", role: "Head of Studio" },
    { name: "Ines Delacroix", role: "Strategy Director" },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* Pull quote                                                                 */
/* -------------------------------------------------------------------------- */

export const quote = {
  text: "They told us to stop chasing the algorithm and start building the thing people would pay for. Then they stayed and built it with us.",
  attribution: "Maya Ellison",
  org: "2.4M subscribers",
} as const;

/* -------------------------------------------------------------------------- */
/* Thinking                                                                   */
/* -------------------------------------------------------------------------- */

export const thinking = {
  eyebrow: "05 — Thinking",
  heading: "Things we have been saying out loud.",
  items: [
    {
      date: "2026-08-14",
      dateLabel: "14 Aug 2026",
      category: "Formats",
      title: "Your retention graph is a confession. Read it properly.",
    },
    {
      date: "2026-07-02",
      dateLabel: "02 Jul 2026",
      category: "Strategy",
      title:
        "Nobody subscribes to a posting schedule. They subscribe to a point of view.",
    },
    {
      date: "2026-05-19",
      dateLabel: "19 May 2026",
      category: "Partnerships",
      title:
        "The brand deal that costs you the audience was never a brand deal.",
    },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* Closing CTA                                                                */
/* -------------------------------------------------------------------------- */

export const cta = {
  eyebrow: "New business",
  /** Short on purpose -- this is the one line on the page set at display-2xl. */
  heading: "Your move.",
  body: "Tell us what you are building and what is in the way. We will tell you honestly whether we are the right studio for it.",
  /** Live contact email from the backend replaces `email` when available. */
  button: { label: "Apply to work with us", href: "/apply" },
  email: "hello@ostreams.com",
  sticker: "Replies in 24h",
} as const;

/** The form inside the closing CTA. Posts to POST /api/v1/contact. */
export const contactForm = {
  submit: "Send it over",
  successTitle: "Thanks — it is with us.",
  successBody: "Someone from the studio will be in touch within a day.",
  sendAnother: "Send another message",
} as const;

/* -------------------------------------------------------------------------- */
/* Apply                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * /apply. The questions themselves are NOT here: they are versioned business
 * data served by GET /api/v1/applications/form.
 */
export const apply = {
  eyebrow: "Applications",
  heading: "Tell us about the channel.",
  lead: "A few questions so we can tell you honestly whether we are the right studio. A real person reads every one.",
  tierLabel: "Which way of working interests you?",
  tierNone: "Not sure yet",
  submit: "Submit application",
  closed: {
    title: "Applications are closed right now.",
    body: "We are not taking new applications at the moment. You can still send us a note from the homepage.",
    link: { label: "Get in touch", href: "/#contact" },
  },
  outdated:
    "The questions changed while you were filling them in. We have loaded the new version — your contact details are kept.",
  duplicate:
    "We already have this exact application from you. No need to send it twice.",
  received: {
    eyebrow: "Received",
    heading: "Application in.",
    body: "Keep your reference. We review every application and will email you with the outcome.",
    referenceLabel: "Reference",
    checkStatus: "Check status",
    startOver: "Start a new application",
  },
  status: {
    UNDER_REVIEW: "Under review",
    ACCEPTED: "Accepted",
    NOT_ACCEPTED: "Not accepted",
    MEETING_SCHEDULED: "Meeting scheduled",
    WITHDRAWN: "Withdrawn",
    CLOSED: "Closed",
  },
  faqHeading: "Before you apply",
} as const;

/* -------------------------------------------------------------------------- */
/* Footer                                                                     */
/* -------------------------------------------------------------------------- */

export const footer = {
  /** The full-bleed band above the footer proper. Scrolling, gold on ink. */
  phraseBand: [
    "Own the audience",
    "Build the business",
    "Keep the upside",
    "Post less, mean more",
  ],
  columns: [
    {
      title: "Studio",
      links: [
        { label: "About", href: "/#studio" },
        { label: "Careers", href: "#" },
        { label: "Contact", href: "/#contact" },
      ],
    },
    {
      title: "Services",
      links: [
        { label: "Brand & Positioning", href: "/#services" },
        { label: "Audience Strategy", href: "/#services" },
        { label: "Partnerships", href: "/#services" },
        { label: "Content Studio", href: "/#services" },
        { label: "Commerce", href: "/#services" },
        { label: "Channel Ops", href: "/#services" },
      ],
    },
  ],
  offices: [
    { city: "London", address: "14 Beak Street, W1F 9RN" },
    { city: "New York", address: "60 Wooster Street, NY 10012" },
  ],
  socials: [
    { label: "YouTube", href: "#" },
    { label: "Instagram", href: "#" },
    { label: "LinkedIn", href: "#" },
  ],
  newsletter: {
    label: "The Signal — one email a month. Formats, numbers, and what is working.",
    placeholder: "you@somewhere.com",
    submit: "Subscribe",
  },
  legal: [
    { label: "© 2026 Østreams Ltd.", href: "#" },
    { label: "Privacy", href: "#" },
    { label: "Terms", href: "#" },
  ],
  quip: "Made in London and New York. Mostly between uploads.",
} as const;
