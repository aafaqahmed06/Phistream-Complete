import type {
  applicationAnswers,
  applicationEvents,
  applicationForms,
  applications,
  faqs,
  leads,
  serviceTiers,
  siteConfig,
  staffUsers,
  testimonials,
} from '../schema/index.js';

/**
 * DEMO DATA ONLY — for local development and the frontend developer.
 *
 * Nothing here is real Phistream Studio content: every text value is marked
 * "[DEMO]", every email/URL uses the reserved example.com domain, and prices
 * use the ISO 4217 *testing* currency code "XTS". Real service tiers, pricing,
 * FAQs, testimonials, eligibility questions, contact details, and the VSL URL
 * must be supplied by the business and entered as data, not added here.
 *
 * Fixed UUIDs make the seed idempotent and easy to recognise.
 */

type Insert<T extends { $inferInsert: unknown }> = T['$inferInsert'];

export const demoId = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const DEMO_TEXT_MARKER = '[DEMO]';

export const demoServiceTiers: Insert<typeof serviceTiers>[] = [
  {
    id: demoId(101),
    slug: 'demo-tier-a',
    name: '[DEMO] Tier A',
    description: '[DEMO] Placeholder service tier. Replace with content supplied by the business.',
    priceAmount: 100_000,
    currency: 'XTS',
    billingPeriod: '[DEMO] period',
    displayOrder: 1,
    isActive: true,
    features: ['[DEMO] Placeholder feature one', '[DEMO] Placeholder feature two'],
  },
  {
    id: demoId(102),
    slug: 'demo-tier-b',
    name: '[DEMO] Tier B (price not published)',
    description: '[DEMO] Placeholder tier without a published price.',
    priceAmount: null,
    currency: null,
    billingPeriod: null,
    displayOrder: 2,
    isActive: true,
    features: ['[DEMO] Placeholder feature'],
  },
  {
    id: demoId(103),
    slug: 'demo-tier-hidden',
    name: '[DEMO] Hidden tier',
    description: '[DEMO] Inactive tier: must never appear in public responses.',
    displayOrder: 3,
    isActive: false,
    features: [],
  },
];

export const demoFaqs: Insert<typeof faqs>[] = [
  {
    id: demoId(201),
    question: '[DEMO] Placeholder question one?',
    answer: '[DEMO] Placeholder answer one.',
    displayOrder: 1,
    isActive: true,
  },
  {
    id: demoId(202),
    question: '[DEMO] Placeholder question two?',
    answer: '[DEMO] Placeholder answer two.',
    displayOrder: 2,
    isActive: true,
  },
  {
    id: demoId(203),
    question: '[DEMO] Inactive question?',
    answer: '[DEMO] Must never appear in public responses.',
    displayOrder: 3,
    isActive: false,
  },
];

export const demoTestimonials: Insert<typeof testimonials>[] = [
  {
    id: demoId(301),
    name: '[DEMO] Person A',
    role: '[DEMO] Role',
    company: '[DEMO] Example Co.',
    quote: '[DEMO] Placeholder testimonial text.',
    displayOrder: 1,
    isActive: true,
  },
  {
    id: demoId(302),
    name: '[DEMO] Person B',
    quote: '[DEMO] Another placeholder testimonial.',
    displayOrder: 2,
    isActive: true,
  },
  {
    id: demoId(303),
    name: '[DEMO] Hidden person',
    quote: '[DEMO] Inactive testimonial: must never appear in public responses.',
    displayOrder: 3,
    isActive: false,
  },
];

export const demoSiteConfig: Insert<typeof siteConfig>[] = [
  {
    id: demoId(401),
    key: 'onboarding.vsl_url',
    value: 'https://example.com/demo-vsl',
    isPublic: true,
    description: '[DEMO] Placeholder VSL URL.',
  },
  {
    id: demoId(402),
    key: 'onboarding.headline',
    value: '[DEMO] Placeholder onboarding headline',
    isPublic: true,
    description: '[DEMO] Placeholder onboarding copy.',
  },
  {
    id: demoId(403),
    key: 'contact.email',
    value: 'hello@example.com',
    isPublic: true,
    description: '[DEMO] Placeholder public contact email.',
  },
  {
    id: demoId(404),
    key: 'internal.demo_private_setting',
    value: { note: '[DEMO] Private config: must never appear in public responses.' },
    isPublic: false,
    description: '[DEMO] Private setting used to test the public/private boundary.',
  },
  {
    id: demoId(405),
    key: 'contact.phone',
    // 555-0100..0199 is reserved for fictional use.
    value: '+1 555-0100',
    isPublic: true,
    description: '[DEMO] Placeholder public phone number.',
  },
  {
    id: demoId(406),
    key: 'social.links',
    value: [
      { label: '[DEMO] Social A', url: 'https://example.com/demo-social-a' },
      { label: '[DEMO] Social B', url: 'https://example.com/demo-social-b' },
    ],
    isPublic: true,
    description: '[DEMO] Placeholder social links.',
  },
  {
    id: demoId(407),
    key: 'onboarding.steps',
    value: [
      { title: '[DEMO] Step 1', description: '[DEMO] Placeholder step description.' },
      { title: '[DEMO] Step 2', description: '[DEMO] Placeholder step description.' },
      { title: '[DEMO] Step 3', description: null },
    ],
    isPublic: true,
    description: '[DEMO] Placeholder onboarding funnel steps.',
  },
];

export const demoStaffUsers: Insert<typeof staffUsers>[] = [
  {
    id: demoId(501),
    authProviderId: 'demo-auth-admin',
    email: 'demo.admin@example.com',
    displayName: '[DEMO] Admin',
    role: 'ADMIN',
  },
  {
    id: demoId(502),
    authProviderId: 'demo-auth-reviewer',
    email: 'demo.reviewer@example.com',
    displayName: '[DEMO] Reviewer',
    role: 'REVIEWER',
  },
];

export const demoLeads: Insert<typeof leads>[] = [
  {
    id: demoId(601),
    email: 'demo.applicant@example.com',
    fullName: '[DEMO] Applicant One',
    companyName: '[DEMO] Example Studio',
    source: 'demo',
    campaign: 'demo',
    landingPath: '/onboarding',
  },
  {
    id: demoId(602),
    email: 'demo.applicant.two@example.com',
    fullName: '[DEMO] Applicant Two',
    source: 'demo',
  },
];

/** Placeholder form version and question keys — not real eligibility questions. */
export const DEMO_FORM_VERSION = 'demo-v1';

/**
 * Placeholder eligibility form. The real questions must be supplied by the
 * business and published with `npm run forms:publish` (docs/applications.md).
 */
export const demoApplicationForms: Insert<typeof applicationForms>[] = [
  {
    id: demoId(1001),
    version: DEMO_FORM_VERSION,
    status: 'ACTIVE',
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    definition: {
      title: '[DEMO] Eligibility form',
      description:
        '[DEMO] Placeholder questions. Replace with the questions supplied by the business.',
      questions: [
        {
          key: 'demo_question_1',
          type: 'text',
          label: '[DEMO] Free-text question',
          required: true,
          multiline: true,
          maxLength: 2000,
        },
        {
          key: 'demo_question_2',
          type: 'number',
          label: '[DEMO] Number question',
          required: false,
          integer: true,
          min: 0,
          max: 100,
        },
        {
          key: 'demo_question_3',
          type: 'single_choice',
          label: '[DEMO] Choice question',
          required: false,
          options: [
            { value: 'demo-a', label: '[DEMO] Option A' },
            { value: 'demo-b', label: '[DEMO] Option B' },
          ],
        },
      ],
    },
  },
];

export const demoApplications: Insert<typeof applications>[] = [
  {
    id: demoId(701),
    reference: 'DEMO-0001',
    leadId: demoId(601),
    serviceTierId: demoId(101),
    formVersion: DEMO_FORM_VERSION,
    status: 'NEW',
  },
  {
    id: demoId(702),
    reference: 'DEMO-0002',
    leadId: demoId(602),
    formVersion: DEMO_FORM_VERSION,
    status: 'ACCEPTED',
    reviewedAt: new Date('2026-01-02T10:00:00Z'),
    reviewedBy: demoId(501),
    acceptedAt: new Date('2026-01-02T10:00:00Z'),
  },
];

export const demoApplicationAnswers: Insert<typeof applicationAnswers>[] = [
  {
    id: demoId(801),
    applicationId: demoId(701),
    questionKey: 'demo_question_1',
    answer: '[DEMO] answer',
  },
  { id: demoId(802), applicationId: demoId(701), questionKey: 'demo_question_2', answer: 3 },
  {
    id: demoId(803),
    applicationId: demoId(702),
    questionKey: 'demo_question_1',
    answer: '[DEMO] answer',
  },
];

export const demoApplicationEvents: Insert<typeof applicationEvents>[] = [
  { id: demoId(901), applicationId: demoId(701), eventType: 'SUBMITTED', actorType: 'APPLICANT' },
  { id: demoId(902), applicationId: demoId(702), eventType: 'SUBMITTED', actorType: 'APPLICANT' },
  {
    id: demoId(903),
    applicationId: demoId(702),
    eventType: 'ACCEPTED',
    actorType: 'STAFF',
    actorId: demoId(501),
  },
];
