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

/**
 * Sections that are built but hidden until their real content exists (see
 * "Phistreams — Demo & Placeholder Inventory", section B). Flip a flag to
 * `true` the day the content is ready -- nothing else needs to change.
 *
 *   stats       the numbers band: needs 4 real figures and the currency
 *   thinking    the articles list: needs real posts or links
 *   newsletter  the footer sign-up: needs a signup endpoint or an email tool
 */
export const showSection: { stats: boolean; thinking: boolean; newsletter: boolean } = {
  stats: false,
  thinking: false,
  newsletter: false,
};

const studioEmail = "contact@phistream.studio";

const navLinks: { label: string; href: string }[] = [
  { label: "Work", href: "/#work" },
  { label: "Services", href: "/services" },
  { label: "How we work", href: "/how-we-work" },
  { label: "Studio", href: "/#studio" },
];
// The Thinking section is hidden until real posts exist (see showSection).
if (showSection.thinking) navLinks.push({ label: "Thinking", href: "/#thinking" });

export const nav = {
  /** Pairs with the pulsing dot. The studio's whole pitch in two words. */
  status: "On air",
  links: navLinks,
  cta: { label: "Get in touch", href: "/#contact" },
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
   * Two entry points instead of a CTA pair, each into its own track page.
   */
  paths: [
    {
      label: "I'm a creator",
      headline: "Turn the audience into a company",
      body: "You already have the attention. We build the funnel, the offer, and the operations underneath it — so revenue doesn't reset to zero every time you stop posting.",
      cta: { label: "See the creator track", href: "/creators" },
    },
    {
      label: "I'm a founder",
      headline: "Turn the company into an audience",
      body: "You already have the business. We build the identity, the format, and the content system that gets you distribution you don't have to buy.",
      cta: { label: "See the founder track", href: "/founders" },
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
  more: { label: "What each one involves", href: "/services" },
  items: [
    {
      id: "01",
      slug: "identity",
      title: "Identity & Positioning",
      body: "Who you are when the camera is off, or when the pitch deck is closed. The one-sentence answer to \"so what do you actually do\" — built to survive outside your own feed, or your own boardroom.",
    },
    {
      id: "02",
      slug: "funnel",
      title: "Audience & Funnel Strategy",
      body: "The path from a stranger's attention to a paying customer, mapped and built — not assumed. Format, cadence, and the funnel underneath it.",
    },
    {
      id: "03",
      slug: "monetization",
      title: "Monetization & Commerce",
      body: "The offer, the price, and the product — courses, memberships, retainers, or a storefront. Revenue that compounds instead of resetting every upload cycle.",
    },
    {
      id: "04",
      slug: "content",
      title: "Content & Format Studio",
      body: "For founders building an on-camera presence for the first time, and creators refining one they already have. The team behind the actual uploads.",
    },
    {
      id: "05",
      slug: "operations",
      title: "Operations & Systems",
      body: "The unglamorous engine: contracts, pipeline, reporting, and someone who answers the email on a Tuesday. The part that makes the business survive past the first good month.",
    },
    {
      id: "06",
      slug: "scaling",
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
  open: "Read the full example",
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
  email: studioEmail,
  sticker: "Replies under 1hr",
} as const;

/** The form inside the closing CTA. Posts to POST /api/v1/contact. */
export const contactForm = {
  submit: "Send it over",
  successTitle: "Thanks — it is with us.",
  successBody: "Someone from the studio will be in touch within a day.",
  sendAnother: "Send another message",
} as const;

/* -------------------------------------------------------------------------- */
/* Application form                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The questions themselves are NOT here: they are versioned business data
 * served by GET /api/v1/applications/form.
 */
export const apply = {
  eyebrow: "Applications",
  heading: "Tell us what you're building.",
  lead: "A few questions so we can tell you honestly whether we are the right studio. A real person reads every one.",
  tierLabel: "Which way of working interests you?",
  tierNone: "Not sure yet",
  submit: "Submit application",
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
        { label: "Careers", href: "/careers" },
        { label: "Contact", href: "/#contact" },
      ],
    },
    {
      title: "Services",
      links: services.items.map((s) => ({
        label: s.title,
        href: `/services#${s.slug}`,
      })),
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
  legal: [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ],
  quip: "Made in Islamabad. Mostly between uploads.",
} as const;

/* -------------------------------------------------------------------------- */
/* Inner pages                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Every page past the homepage is the same shape -- an ink intro, then a run
 * of sections -- rendered by components/DocPage.tsx. Section `id`s are anchor
 * targets (/services#funnel).
 */
export type DocSection = {
  id?: string;
  eyebrow?: string;
  heading: string;
  body: readonly string[];
  points?: readonly string[];
  link?: { label: string; href: string };
};

export type Doc = {
  /** Short name for the <title>. */
  name: string;
  eyebrow: string;
  title: string;
  lead: string;
  sections: readonly DocSection[];
  /** The "Your move." contact band before the footer. Off for legal pages. */
  cta?: boolean;
};

const [creatorWork, founderWork] = work.items;

const deliverables: Record<(typeof services.items)[number]["slug"], DocSection> = {
  identity: {
    heading: "Identity & Positioning",
    body: [
      "We start with interviews — you, your audience or customers, and the people who already sell you — and end with a positioning the whole team can repeat word for word.",
    ],
    points: [
      "Positioning statement and the one-sentence answer",
      "Audience or customer profile, written from real conversations",
      "Name, voice and messaging guide",
      "Visual identity direction, or a full system where one is needed",
      "Bio, pitch and about-page copy that all say the same thing",
    ],
  },
  funnel: {
    heading: "Audience & Funnel Strategy",
    body: [
      "We map where attention arrives today, where it leaks, and what a paying customer's first step should be — then build the pages, the list and the sequence that connect them.",
    ],
    points: [
      "Funnel map from first view to first purchase",
      "Lead magnet and email list setup",
      "Landing and sales pages",
      "Format and cadence plan tied to the funnel, not the algorithm",
      "Conversion tracking at every step",
    ],
  },
  monetization: {
    heading: "Monetization & Commerce",
    body: [
      "We test the offer before we build the product. Price, promise and format are checked with a small group first, so the launch is not the first time anyone sees it.",
    ],
    points: [
      "Offer design and pricing",
      "Product build: course, membership, retainer or storefront",
      "Checkout, payments and delivery",
      "Launch plan and pre-sale",
      "Sponsorship and partnership rate card",
    ],
  },
  content: {
    heading: "Content & Format Studio",
    body: [
      "Founders get a format they can actually sustain on camera. Creators get a production team, so the format stops depending on them doing everything.",
    ],
    points: [
      "Show format and episode structure",
      "On-camera coaching for first-time presenters",
      "Scripting, filming and editing",
      "Repurposing across platforms",
      "A content calendar the team can run without you writing every post",
    ],
  },
  operations: {
    heading: "Operations & Systems",
    body: [
      "We set the back office up once, write it down, and hand it to whoever runs it next — us, your team, or a hire we help you make.",
    ],
    points: [
      "Contract and partner agreement templates",
      "Sales pipeline and inbox handling",
      "Monthly reporting against the agreed number",
      "Tools, automations and handover docs",
      "A hiring plan for the roles you will need next",
    ],
  },
  scaling: {
    heading: "Scaling & Growth Strategy",
    body: [
      "Once one system works, we decide what grows it — a second offer, a new channel, a team, a partnership — and what to stop doing to make room.",
    ],
    points: [
      "A growth plan with one primary metric",
      "Revenue per view, per follower and per deal benchmarks",
      "New channel and offer expansion",
      "Team structure and hiring",
      "Quarterly review and re-plan",
    ],
  },
};

export const pages: Record<string, Doc> = {
  services: {
    name: "Services",
    eyebrow: "Services",
    title: "Six disciplines, in detail.",
    lead: services.lead,
    sections: services.items.map((s) => ({
      ...deliverables[s.slug],
      id: s.slug,
      eyebrow: s.id,
      body: [s.body, ...deliverables[s.slug].body],
    })),
  },

  creators: {
    name: "For creators",
    eyebrow: "Creator track",
    title: "Turn the audience into a company.",
    lead: hero.paths[0].body,
    sections: [
      {
        heading: "Where creators get stuck",
        body: [
          "Sponsorship income moves with the algorithm. Stop posting for a month and revenue goes to zero. The audience is real, but nothing underneath it is owned.",
        ],
      },
      {
        heading: "What we build",
        body: [
          "Usually in this order — but direction comes first, so the order is decided after we have seen what you already have.",
        ],
        points: [
          "Audience & Funnel Strategy — the path from a viewer to a customer",
          "Monetization & Commerce — an offer you own, priced properly",
          "Operations & Systems — so the business runs when you are not on camera",
          "Scaling & Growth Strategy — more revenue per view, not just more views",
        ],
        link: { label: "All six disciplines", href: "/services" },
      },
      {
        eyebrow: `${creatorWork.track} · ${work.chip}`,
        heading: creatorWork.title,
        body: [creatorWork.body],
        link: { label: work.open, href: `/work/${creatorWork.id}` },
      },
      {
        heading: "What we measure",
        body: [
          "Revenue per view, not view count. We agree the number before we start and report against it every month.",
        ],
      },
    ],
  },

  founders: {
    name: "For founders",
    eyebrow: "Founder track",
    title: "Turn the company into an audience.",
    lead: hero.paths[1].body,
    sections: [
      {
        heading: "Where founders get stuck",
        body: [
          "Every customer is bought through ads or won one sales call at a time. The founder knows the business better than anyone, but nobody outside it has heard them talk about it.",
        ],
      },
      {
        heading: "What we build",
        body: [
          "Usually in this order — but direction comes first, so the order is decided after we have seen what you already have.",
        ],
        points: [
          "Identity & Positioning — who you are when the pitch deck is closed",
          "Content & Format Studio — an on-camera format you can sustain",
          "Audience & Funnel Strategy — viewers routed into the pipeline you already have",
          "Operations & Systems — a content system the team runs without you writing every post",
        ],
        link: { label: "All six disciplines", href: "/services" },
      },
      {
        eyebrow: `${founderWork.track} · ${work.chip}`,
        heading: founderWork.title,
        body: [founderWork.body],
        link: { label: work.open, href: `/work/${founderWork.id}` },
      },
      {
        heading: "What we measure",
        body: [
          "Distribution cost that goes down instead of up — what a customer costs when they find you, against what they cost when you go out and buy them.",
        ],
      },
    ],
  },

  "how-we-work": {
    name: "How we work",
    eyebrow: "How we work",
    title: "What it costs, and how long it takes.",
    lead: "Nothing should be a surprise on the first call. This is how an engagement is shaped, priced and paced.",
    sections: [
      {
        heading: "What it costs",
        body: [
          "Every engagement starts with a discovery call, and nothing is priced until we have had one. These are starting points, not quotes: what you pay is scoped to what you need.",
          "Clients outside Pakistan are billed in USD; clients in Pakistan are billed in PKR.",
        ],
      },
      {
        eyebrow: "Founders",
        heading: "Branding, content and social presence",
        body: [],
        points: [
          "Starter · Positioning Consult & 6-Month Roadmap — from $3,500 / PKR 150,000. A positioning and market audit, two strategy sessions and a written six-month plan. The plan, not the build.",
          "Build · Full Brand Identity + Website — from $15,000 / PKR 700,000. Logo, palette, typography and guidelines, plus a 5–8 page website, built and launched.",
          "Scale · Identity, Website, Content Plan & Revenue Consulting — from $35,000 / PKR 1,800,000. Everything in Build, a content system for your own presence, and consulting to open new income sources. Extension retainer from $5,000 / PKR 250,000 a month.",
        ],
      },
      {
        eyebrow: "Creators",
        heading: "Growth, monetization and representation",
        body: [],
        points: [
          "Starter · Growth Consultation — from $2,500 / PKR 120,000. A channel and content audit, one to two strategy sessions and a written growth plan.",
          "Operator · Growth Operator Service — from $8,000 / PKR 400,000 a month. Content strategy, scripting and packaging direction, thumbnail and title guidance, cadence management and monthly reporting.",
          "Represented · Growth + PR, Sponsorships & Events — from $12,000 / PKR 700,000 a month, plus 15–20% commission on the deals we secure. Everything in Operator, and we source and negotiate income on your behalf.",
        ],
      },
      {
        heading: "Engagement length",
        body: [
          "Starter engagements are a fixed piece of work: an audit, sessions and a written plan. Build is a project, run until the identity and site are launched.",
          "Scale is scoped as a three-month engagement and can extend on a monthly retainer. Operator and Represented are retainers with a minimum term of three months. The first 90 days are fixed; after that we agree the next quarter based on what the numbers say.",
        ],
      },
      {
        heading: "The first 90 days",
        body: ["The same shape whichever track you come in on."],
        points: [
          "Days 1–15 · Diagnose — interviews, an audit of what exists, and the one number we will be judged on",
          "Days 16–45 · Build — positioning, funnel and offer: the system the rest of the work depends on",
          "Days 46–90 · Run and measure — the system goes live, we report against the agreed number, and decide what the next quarter is for",
        ],
      },
      {
        heading: "What we hold ourselves to",
        body: [],
        points: approach.principles.map((p) => `${p.title} — ${p.body}`),
      },
      {
        heading: "Getting started",
        body: [
          "Get in touch and tell us what you are building. A real person reads every message, and we will tell you honestly whether we are the right studio for it.",
        ],
        link: { label: "Get in touch", href: "/#contact" },
      },
    ],
  },

  careers: {
    name: "Careers",
    eyebrow: "Careers",
    title: "Work at Phistreams.",
    lead: "Five people in Islamabad, building the business behind the audience and the audience behind the business.",
    sections: [
      {
        heading: "Open roles",
        body: ["We are not advertising specific roles right now."],
      },
      {
        heading: "Write to us anyway",
        body: [
          "If you are good at funnels, formats, operations or editing, and would rather build something that lasts than chase views, send a short note and a link to your work.",
        ],
        link: { label: studioEmail, href: `mailto:${studioEmail}` },
      },
    ],
  },

  privacy: {
    name: "Privacy",
    eyebrow: "Legal",
    title: "Privacy",
    lead: "What this site collects, why, and how to have it removed. Last updated 7 October 2026.",
    cta: false,
    sections: [
      {
        heading: "Who we are",
        body: [
          `Phistreams is a studio based in Islamabad. For anything about your data, email ${studioEmail}.`,
        ],
      },
      {
        heading: "What we collect",
        body: [],
        points: [
          "Contact form — your name, email, channel or company, and your message.",
          "Applications — your contact details and your answers to the application questions.",
          "Calls — if we schedule one, the time and the details you give us for it.",
          "Anonymous visit data — the page you are on, the site that sent you, any campaign tags in the link, and a random id for the visit. No IP address or device details are stored with it.",
        ],
      },
      {
        heading: "Why we use it",
        body: [
          "To reply to you, to review applications and run engagements, and to see which pages and campaigns bring people to the studio. We do not sell your data or use it for advertising.",
        ],
      },
      {
        heading: "Cookies and storage",
        body: [
          "We do not use advertising or tracking cookies. The visit id lives in your browser's session storage and is cleared when you close the tab.",
        ],
      },
      {
        heading: "Where it is kept",
        body: [
          "With the providers that run the site for us: Vercel (hosting) and Supabase (database), Resend (the emails we send you) and Cal.com (booking calls). Only studio staff who sign in can read your messages and applications. We do not sell your data.",
        ],
      },
      {
        heading: "How long, and your rights",
        body: [
          `We keep your messages and applications until you ask us to delete them, so we can pick up the conversation later; there is no automatic expiry. Anonymous visit data is deleted after about 13 months, and records of the emails we send are deleted after 12 months. To see, correct or delete what we hold about you, email ${studioEmail}; deletion also removes your messages, applications and answers from our database, and we will ask Resend and Cal.com to remove their copies.`,
        ],
      },
      {
        heading: "Changes",
        body: ["If this changes, we will update this page and the date above."],
      },
    ],
  },

  terms: {
    name: "Terms",
    eyebrow: "Legal",
    title: "Terms",
    lead: "The rules for using this website. Last updated 6 October 2026.",
    cta: false,
    sections: [
      {
        heading: "Using this site",
        body: [
          "Browse, share and link to it freely. Please do not misuse it — for example by trying to break it, scraping it at volume, or submitting forms on someone else's behalf.",
        ],
      },
      {
        heading: "Our content",
        body: [
          "The text, the design and the φstreams mark belong to Phistreams. Work marked as illustrative is a representative example of how an engagement runs, not a real client result.",
        ],
      },
      {
        heading: "Not an offer",
        body: [
          "Nothing on this site is a binding offer or professional advice. Every engagement has its own written agreement, and that agreement takes precedence over anything here.",
        ],
      },
      {
        heading: "Liability",
        body: [
          "The site is provided as it is. We work to keep it accurate and available, but cannot promise it always will be, and are not liable for losses from relying on it.",
        ],
      },
      {
        heading: "Contact",
        body: [`Questions about these terms: ${studioEmail}.`],
      },
    ],
  },
};

/** Illustrative case study pages, at /work/<work item id>. */
export const caseStudies: Record<string, Doc> = {
  [creatorWork.id]: {
    name: creatorWork.title,
    eyebrow: `${creatorWork.track} · ${work.chip}`,
    title: creatorWork.title,
    lead: work.disclaimer,
    sections: [
      {
        heading: "The starting point",
        body: [
          "A mid-size tutorial creator with a loyal audience and most of their income from sponsorships. Revenue rose and fell with the upload schedule; a quiet month meant a quiet bank account.",
        ],
      },
      {
        heading: "What we built",
        body: [
          "Identity, offer and operations, built in parallel with the content calendar — not after it.",
        ],
        points: [
          "Positioning — the tutorials become the free first step of a paid path",
          "Funnel — every video points to one lead magnet and one email list",
          "Offer — a self-paced product line, priced and pre-sold to the list before it was built",
          "Operations — checkout, delivery and support, set up so the creator answers none of it",
        ],
      },
      {
        heading: "What we measured",
        body: [
          `${creatorWork.metric}. The goal is income that holds up in a month with fewer uploads.`,
        ],
        link: { label: "See the creator track", href: "/creators" },
      },
    ],
  },
  [founderWork.id]: {
    name: founderWork.title,
    eyebrow: `${founderWork.track} · ${work.chip}`,
    title: founderWork.title,
    lead: work.disclaimer,
    sections: [
      {
        heading: "The starting point",
        body: [
          "An operator-led company with a strong product and a founder nobody outside the industry had heard of. Every new customer came through paid ads or outbound sales.",
        ],
      },
      {
        heading: "What we built",
        body: [
          "The founder's on-camera presence, from zero, with a content system the team can run without the founder writing every post.",
        ],
        points: [
          "Identity — the founder's point of view, written down and agreed before anything was filmed",
          "Format — one recurring show the founder could sustain in a couple of hours a week",
          "Content system — the team scripts, edits and repurposes; the founder shows up and talks",
          "Funnel — viewers routed into the existing sales pipeline and tracked as a real channel",
        ],
      },
      {
        heading: "What we measured",
        body: [
          `${founderWork.metric}. The audience became an acquisition channel instead of a vanity project.`,
        ],
        link: { label: "See the founder track", href: "/founders" },
      },
    ],
  },
};
