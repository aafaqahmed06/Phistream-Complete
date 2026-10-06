/**
 * Every string on the page lives here. Sections import from this file so copy
 * can be revised without touching layout, and so the voice stays consistent.
 *
 * The voice: a studio for creators becoming founders and founders becoming
 * creators. It talks like the client's own team, not an agency pitch. Short
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
  [{ t: "Creators" }, { t: "become" }, { t: "founders." }],
  [
    { t: "Founders" },
    { t: "become" },
    { t: "creators.", highlight: true, wonk: true },
  ],
];

export const hero = {
  eyebrow: "A studio for creators and founders — Islamabad",
  headline: { lines: heroLines },
  lead: "Phistreams builds the business behind the audience, and the audience behind the business. Funnels, operations, identity, and the scaling plan that turns attention into equity.",
  /**
   * Two entry points instead of a CTA pair. Both go to the strategy call until
   * the dedicated creator / founder track pages exist.
   */
  paths: [
    {
      label: "I'm a creator",
      headline: "Turn the audience into a company",
      body: "You already have the attention. We build the funnel, the offer, and the operations underneath it — so revenue doesn't reset to zero every time you stop posting.",
      cta: { label: "See the creator track", href: "/#contact" },
    },
    {
      label: "I'm a founder",
      headline: "Turn the company into an audience",
      body: "You already have the business. We build the identity, the format, and the content system that gets you distribution you don't have to buy.",
      cta: { label: "See the founder track", href: "/#contact" },
    },
  ],
  rail: "Creators · Founders · Islamabad",
  scrollCue: "Scroll",
  est: "Islamabad",
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
  // ponytail: placeholder figures from the copy doc -- replace every one with
  // real numbers before launch.
  items: [
    {
      display: "[XX]",
      label: "Creators and founders advised",
      note: "Placeholder",
    },
    {
      display: "[£XXk / $XXk]",
      label: "Revenue moved through funnels we've built",
      note: "Placeholder",
    },
    {
      display: "[XX]",
      label: "Engagements completed",
      note: "Placeholder",
    },
    {
      display: "[XX]",
      label: "Months since founding",
      note: "Placeholder",
    },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* Services                                                                   */
/* -------------------------------------------------------------------------- */

export const services = {
  eyebrow: "01 — What we do",
  heading: "Six things, done properly.",
  lead: "Six disciplines. Built to work in both directions — whether you're building the audience first or the business first.",
  items: [
    {
      id: "01",
      title: "Identity & Positioning",
      body: "Who you are when the camera is off, or when the pitch deck is closed. The one-sentence answer to \"so what do you actually do\" — built to survive outside your own feed, or your own boardroom.",
    },
    {
      id: "02",
      title: "Audience & Funnel Strategy",
      body: "The path from a stranger's attention to a paying customer, mapped and built — not assumed. Format, cadence, and the funnel underneath it.",
    },
    {
      id: "03",
      title: "Monetization & Commerce",
      body: "The offer, the price, and the product — courses, memberships, retainers, or a storefront. Revenue that compounds instead of resetting every upload cycle.",
    },
    {
      id: "04",
      title: "Content & Format Studio",
      body: "For founders building an on-camera presence for the first time, and creators refining one they already have. The team behind the actual uploads.",
    },
    {
      id: "05",
      title: "Operations & Systems",
      body: "The unglamorous engine: contracts, pipeline, reporting, and someone who answers the email on a Tuesday. The part that makes the business survive past the first good month.",
    },
    {
      id: "06",
      title: "Scaling & Growth Strategy",
      body: "The plan to grow this into something that compounds — more revenue per view, per follower, per deal — not just something that posts more often.",
    },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* Work                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Case studies are built as THUMBNAILS -- the format the visitor already reads
 * for a living. `title` is the big text burned onto the plate; `track` and
 * "Illustrative" are the corner stamps.
 *
 * These are ILLUSTRATIVE, not client results, and the page says so. Swap in
 * real work once it exists.
 */
export const work = {
  eyebrow: "02 — Selected work",
  heading: "Two ways it plays out.",
  sticker: "Illustrative",
  disclaimer:
    "Representative examples of how an engagement runs — not real client results.",
  chip: "Illustrative",
  open: "Read the example",
  metricLabel: "Illustrative metric",
  items: [
    {
      id: "creator",
      track: "Creator track",
      title: "From Tutorials to a Product Line",
      body: "A mid-size creator moves off sponsorship dependency by building a funnel from content into an owned product — identity, offer, and operations built in parallel with the content calendar, not after it.",
      metric: "Revenue per view, not just view count",
      /** Drives the generated plate gradient -- see Work.tsx */
      accent: "top-left",
    },
    {
      id: "founder",
      track: "Founder track",
      title: "The Founder Who Became the Best Marketing Channel",
      body: "An operator-led company builds its founder's on-camera presence from zero, with a content system the team can run without the founder writing every post — audience becomes a real acquisition channel instead of a vanity project.",
      metric: "Distribution cost that goes down instead of up",
      accent: "bottom-right",
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
      title: "Direction before tactics",
      body: "Know whether you are building a company or building an audience before you pick the channel. We won't start with a content calendar if the real gap is the funnel, or vice versa.",
    },
    {
      id: "02",
      title: "Own the infrastructure",
      body: "Platforms change their mind about what they'll show you. The funnel, the list, and the offer don't move when an algorithm does.",
    },
    {
      id: "03",
      title: "One system, properly built",
      body: "One funnel that converts beats ten posts that don't. Restraint is a strategy, not a budget line.",
    },
    {
      id: "04",
      title: "Measure what pays",
      body: "Views are a delivery metric. We agree the number that actually matters — revenue per follower, conversion rate, deal size — before we start, and report against it honestly.",
    },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* Studio                                                                     */
/* -------------------------------------------------------------------------- */

export const studio = {
  eyebrow: "04 — The studio",
  heading: "Five people. Based in Islamabad.",
  lead: "The people who pitch the work are the people who make it.",
  members: [
    { name: "M. Wasay Hayat", role: "CEO" },
    { name: "Aafaq Ahmed", role: "CTO" },
    { name: "Hannan Khalid", role: "COO" },
    { name: "Ali Ghumman", role: "CFO" },
    { name: "Durre Maya", role: "Creative Director" },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* Thinking                                                                   */
/* -------------------------------------------------------------------------- */

/** Titles only until the posts exist -- shown as "Coming soon", not links. */
export const thinking = {
  eyebrow: "05 — Thinking",
  heading: "Things we have been saying out loud.",
  soon: "Coming soon",
  items: [
    {
      category: "Funnels",
      title: "Your funnel is a confession. Read it properly.",
    },
    {
      category: "Strategy",
      title: "Nobody subscribes to a posting schedule. They subscribe to an offer.",
    },
    {
      category: "Formats",
      title:
        "The founder who won't go on camera is leaving distribution on the table.",
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
  body: "Tell us what you're building and what's in the way — a following that doesn't pay yet, or a business nobody's heard of. We'll tell you honestly whether we're the right studio for it.",
  /** Live contact email from the backend replaces `email` when available. */
  button: { label: "Book a strategy call", href: "/apply" },
  email: "hello@phistreams.co",
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
        { label: "Contact", href: "/#contact" },
      ],
    },
    {
      title: "Services",
      links: services.items.map((s) => ({ label: s.title, href: "/#services" })),
    },
  ],
  /** City only until a street address is confirmed. */
  office: { city: "Islamabad" },
  /** Empty until real handles exist; live socials from the backend win. */
  socials: [] as { label: string; href: string }[],
  newsletter: {
    label: "The Golden Hour — one email a month. Funnels, formats, and what's actually converting.",
    placeholder: "you@somewhere.com",
    submit: "Subscribe",
  },
  copyright: "© 2026 Phistreams",
  quip: "Made in Islamabad. Mostly between uploads.",
} as const;
