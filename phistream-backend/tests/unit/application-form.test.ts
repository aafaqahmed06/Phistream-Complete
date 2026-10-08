import { describe, expect, it } from 'vitest';

import {
  buildAnswersSchema,
  formDefinitionSchema,
  type FormDefinition,
} from '../../src/modules/applications/application-form.js';
import {
  generateReference,
  REFERENCE_PATTERN,
  submissionFingerprint,
} from '../../src/modules/applications/application-identifiers.js';
import { TEST_ANSWERS, TEST_FORM } from '../helpers/fake-applications.js';

const answers = buildAnswersSchema(TEST_FORM);

const issuePaths = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((issue) => issue.path.join('/')) ?? [];

describe('form definition schema', () => {
  it('accepts every question type and applies defaults', () => {
    const parsed = formDefinitionSchema.parse({
      questions: [{ key: 'q1', type: 'text', label: 'Q1' }],
    });
    expect(parsed.questions[0]).toEqual({
      key: 'q1',
      type: 'text',
      label: 'Q1',
      required: true,
      multiline: false,
      maxLength: 500,
    });
    expect(formDefinitionSchema.safeParse(TEST_FORM).success).toBe(true);
  });

  it.each([
    ['no questions', { questions: [] }],
    ['a bad key', { questions: [{ key: 'Bad-Key', type: 'text', label: 'x' }] }],
    ['an unknown type', { questions: [{ key: 'q', type: 'file', label: 'x' }] }],
    [
      'duplicate keys',
      {
        questions: [
          { key: 'q', type: 'text', label: 'a' },
          { key: 'q', type: 'boolean', label: 'b' },
        ],
      },
    ],
    [
      'duplicate option values',
      {
        questions: [
          {
            key: 'q',
            type: 'single_choice',
            label: 'x',
            options: [
              { value: 'a', label: 'A' },
              { value: 'a', label: 'B' },
            ],
          },
        ],
      },
    ],
    [
      'a single option',
      {
        questions: [
          { key: 'q', type: 'single_choice', label: 'x', options: [{ value: 'a', label: 'A' }] },
        ],
      },
    ],
    ['min > max', { questions: [{ key: 'q', type: 'number', label: 'x', min: 5, max: 1 }] }],
    [
      'maxSelections above option count',
      {
        questions: [
          {
            key: 'q',
            type: 'multiple_choice',
            label: 'x',
            options: [
              { value: 'a', label: 'A' },
              { value: 'b', label: 'B' },
            ],
            maxSelections: 3,
          },
        ],
      },
    ],
    [
      'too long a text limit',
      { questions: [{ key: 'q', type: 'text', label: 'x', maxLength: 5001 }] },
    ],
    ['a legacy placeholder', { legacyPlaceholder: true, questions: [] }],
  ])('rejects %s', (_, definition) => {
    expect(formDefinitionSchema.safeParse(definition).success).toBe(false);
  });

  it('rejects more than 50 questions', () => {
    const questions = Array.from({ length: 51 }, (_, i) => ({
      key: `q${i}`,
      type: 'boolean',
      label: 'x',
    }));
    expect(formDefinitionSchema.safeParse({ questions }).success).toBe(false);
  });
});

describe('answers validation', () => {
  it('accepts valid answers and drops unanswered optional ones', () => {
    expect(
      answers.parse({
        ...TEST_ANSWERS,
        about: '  I make videos.  ',
        followers: null,
        portfolio: '',
      }),
    ).toEqual({ about: 'I make videos.', platform: 'instagram', agree: true });
  });

  it('accepts every answer type', () => {
    const full = {
      ...TEST_ANSWERS,
      about: 'Line one\nLine two',
      followers: 1200,
      goals: ['growth', 'brand'],
      agree: false,
      portfolio: 'https://example.com/me',
    };
    expect(answers.parse(full)).toEqual(full);
  });

  it.each([
    ['a missing required text', { platform: 'instagram', agree: true }, 'about'],
    ['a blank required text', { ...TEST_ANSWERS, about: '   ' }, 'about'],
    ['a missing required boolean', { about: 'x', platform: 'instagram' }, 'agree'],
    ['a text over maxLength', { ...TEST_ANSWERS, about: 'x'.repeat(201) }, 'about'],
    ['a control character', { ...TEST_ANSWERS, about: 'x\u0007' }, 'about'],
    ['a non-integer', { ...TEST_ANSWERS, followers: 1.5 }, 'followers'],
    ['a number below min', { ...TEST_ANSWERS, followers: -1 }, 'followers'],
    ['a numeric string', { ...TEST_ANSWERS, followers: '12' }, 'followers'],
    ['an unknown option', { ...TEST_ANSWERS, platform: 'myspace' }, 'platform'],
    ['too many selections', { ...TEST_ANSWERS, goals: ['growth', 'brand', 'sales'] }, 'goals'],
    ['duplicate selections', { ...TEST_ANSWERS, goals: ['growth', 'growth'] }, 'goals'],
    ['an unknown selection', { ...TEST_ANSWERS, goals: ['fame'] }, 'goals'],
    ['a boolean as string', { ...TEST_ANSWERS, agree: 'true' }, 'agree'],
    ['a javascript: URL', { ...TEST_ANSWERS, portfolio: 'javascript:alert(1)' }, 'portfolio'],
    ['a non-URL', { ...TEST_ANSWERS, portfolio: 'my site' }, 'portfolio'],
    ['a word with no domain', { ...TEST_ANSWERS, portfolio: 'hello' }, 'portfolio'],
    ['a bare handle', { ...TEST_ANSWERS, portfolio: '@mychannel' }, 'portfolio'],
    ['an ftp URL', { ...TEST_ANSWERS, portfolio: 'ftp://example.com' }, 'portfolio'],
    ['an object as text', { ...TEST_ANSWERS, about: { nested: true } }, 'about'],
  ])('rejects %s', (_, input, path) => {
    const result = answers.safeParse(input);
    expect(result.success).toBe(false);
    // Array issues point at the element (e.g. "goals/0").
    expect(issuePaths(result).some((p) => p === path || p.startsWith(`${path}/`))).toBe(true);
  });

  it.each([
    ['youtube.com/@mychannel', 'https://youtube.com/@mychannel'],
    ['www.example.com', 'https://www.example.com'],
    ['  example.co.uk/about  ', 'https://example.co.uk/about'],
    ['http://example.com', 'http://example.com'],
    ['https://example.com/me', 'https://example.com/me'],
    ['HTTPS://Example.com', 'HTTPS://Example.com'],
  ])('accepts the web address %j without needing https:// (stored as %j)', (typed, stored) => {
    expect(answers.parse({ ...TEST_ANSWERS, portfolio: typed }).portfolio).toBe(stored);
  });

  it('rejects answers to questions that are not on the form', () => {
    const result = answers.safeParse({ ...TEST_ANSWERS, invented_question: 'x' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.code).toBe('unrecognized_keys');
  });

  it('requires at least one selection for a required multiple-choice question', () => {
    const form: FormDefinition = formDefinitionSchema.parse({
      questions: [
        {
          key: 'pick',
          type: 'multiple_choice',
          label: 'Pick',
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
        },
      ],
    });
    expect(buildAnswersSchema(form).safeParse({ pick: [] }).success).toBe(false);
    expect(buildAnswersSchema(form).safeParse({ pick: ['a'] }).success).toBe(true);
  });
});

describe('application identifiers', () => {
  it('generates references like PHI-2026-XXXXXX without ambiguous characters', () => {
    const at = new Date('2026-03-01T00:00:00Z');
    const references = new Set(Array.from({ length: 200 }, () => generateReference(at)));
    for (const reference of references) {
      expect(reference).toMatch(REFERENCE_PATTERN);
      expect(reference.slice(9)).not.toMatch(/[ILOU]/);
    }
    expect(references.size).toBeGreaterThan(190);
  });

  it('fingerprints ignore key order and multiple-choice order', () => {
    const base = { email: 'a@example.com', formVersion: 'v1', serviceTierId: null };
    const one = submissionFingerprint({ ...base, answers: { a: 1, goals: ['x', 'y'] } });
    const two = submissionFingerprint({ ...base, answers: { goals: ['y', 'x'], a: 1 } });
    expect(one).toBe(two);
    expect(one).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['email', { email: 'b@example.com' }],
    ['form version', { formVersion: 'v2' }],
    ['service tier', { serviceTierId: '00000000-0000-4000-8000-000000000001' }],
    ['answers', { answers: { a: 2 } }],
  ])('fingerprints differ when the %s differs', (_, change) => {
    const base = {
      email: 'a@example.com',
      formVersion: 'v1',
      serviceTierId: null,
      answers: { a: 1 },
    };
    expect(submissionFingerprint({ ...base, ...change })).not.toBe(submissionFingerprint(base));
  });
});
