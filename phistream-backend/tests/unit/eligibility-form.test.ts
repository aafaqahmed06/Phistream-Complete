import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildAnswersSchema,
  formDefinitionSchema,
} from '../../src/modules/applications/application-form.js';

/** The real eligibility form, as published with `npm run forms:publish`. */
const raw: unknown = JSON.parse(
  readFileSync(new URL('../../forms/eligibility-2026-10.json', import.meta.url), 'utf8'),
);

const definition = formDefinitionSchema.parse(raw);
const answers = buildAnswersSchema(definition);

/** A complete creator application: founder-only questions left blank. */
const creator = {
  track: 'creator',
  main_link: 'https://youtube.com/@example',
  market: 'international',
  building: 'A tutorial channel whose income rises and falls with the upload schedule.',
  monthly_revenue: 4200,
  time_in_market: '1_to_3_years',
  revenue_sources: ['sponsorships', 'platform_ads'],
  owned_assets: ['email_list'],
  needs: ['funnel', 'monetization'],
  success_metric: 'Revenue per view, doubling within six months.',
  weekly_time: '3_to_5',
  decision_maker: 'yes',
  budget_fit: 'retainer_or_build',
  term_commitment: 'yes',
  start_timeline: 'within_month',
  discovery_call_ack: true,
  contact_consent: true,
};

describe('eligibility form (forms/eligibility-2026-10.json)', () => {
  it('is a valid form definition', () => {
    expect(definition.questions.length).toBeGreaterThan(10);
  });

  it('accepts a complete creator application without the founder-only questions', () => {
    expect(answers.safeParse(creator).success).toBe(true);
  });

  it('accepts a founder application with the founder-only questions', () => {
    const founder = {
      ...creator,
      track: 'founder',
      market: 'pakistan',
      founder_acquisition: ['paid_ads', 'outbound'],
      founder_team_size: '6_to_20',
      founder_on_camera: 'willing',
    };
    expect(answers.safeParse(founder).success).toBe(true);
  });

  it.each(['track', 'main_link', 'market', 'building', 'monthly_revenue', 'needs', 'budget_fit'])(
    'requires %s',
    (key) => {
      const rest = Object.fromEntries(Object.entries(creator).filter(([k]) => k !== key));
      expect(answers.safeParse(rest).success).toBe(false);
    },
  );

  it('accepts a pre-revenue applicant (0 is an answer, not a blank)', () => {
    expect(answers.safeParse({ ...creator, monthly_revenue: 0 }).success).toBe(true);
  });

  it('allows at most three disciplines', () => {
    const four = ['identity', 'funnel', 'monetization', 'content'];
    expect(answers.safeParse({ ...creator, needs: four }).success).toBe(false);
  });

  it('rejects an unknown question key', () => {
    expect(answers.safeParse({ ...creator, demo_question_1: 'x' }).success).toBe(false);
  });
});
