import { z } from 'zod';

import { blankToUndefined } from '../../shared/validation/fields.js';

/**
 * The eligibility form model.
 *
 * The actual questions are business data stored per version in
 * `application_forms.definition`; nothing here names a real question. This
 * module defines what a definition may contain and derives, from a
 * definition, the validator for submitted answers.
 *
 * Question types are deliberately few. Adding one means: a schema here, an
 * answer validator in `answerSchemaFor`, and frontend rendering support.
 */

export const FORM_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/;
/** Matches the `application_answers.question_key` CHECK constraint. */
export const QUESTION_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const OPTION_VALUE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,99}$/;

export const FORM_LIMITS = {
  questions: 50,
  options: 50,
  textMaxLength: 5000,
  urlMaxLength: 2048,
} as const;

/** Control characters other than tab/LF/CR are never valid in answers. */
const MULTI_LINE_FORBIDDEN = /[^\P{Cc}\t\n\r]/u;
const SINGLE_LINE_FORBIDDEN = /[\p{Cc}\p{Zl}\p{Zp}]/u;

const questionBase = {
  key: z.string().regex(QUESTION_KEY_PATTERN, 'must be lowercase snake_case (max 64 chars)'),
  label: z.string().trim().min(1).max(500),
  description: z.string().trim().min(1).max(1000).optional(),
  required: z.boolean().default(true),
};

const option = z.object({
  value: z.string().regex(OPTION_VALUE_PATTERN, 'must be lowercase letters, digits, _ or -'),
  label: z.string().trim().min(1).max(200),
});

const options = z.array(option).min(2).max(FORM_LIMITS.options);

const textQuestion = z.object({
  ...questionBase,
  type: z.literal('text'),
  multiline: z.boolean().default(false),
  maxLength: z.number().int().min(1).max(FORM_LIMITS.textMaxLength).default(500),
});

const numberQuestion = z.object({
  ...questionBase,
  type: z.literal('number'),
  integer: z.boolean().default(false),
  min: z.number().optional(),
  max: z.number().optional(),
});

const singleChoiceQuestion = z.object({
  ...questionBase,
  type: z.literal('single_choice'),
  options,
});

const multipleChoiceQuestion = z.object({
  ...questionBase,
  type: z.literal('multiple_choice'),
  options,
  minSelections: z.number().int().min(0).optional(),
  maxSelections: z.number().int().min(1).optional(),
});

const booleanQuestion = z.object({ ...questionBase, type: z.literal('boolean') });

const urlQuestion = z.object({ ...questionBase, type: z.literal('url') });

export const questionSchema = z
  .discriminatedUnion('type', [
    textQuestion,
    numberQuestion,
    singleChoiceQuestion,
    multipleChoiceQuestion,
    booleanQuestion,
    urlQuestion,
  ])
  .superRefine((question, ctx) => {
    if ('options' in question) {
      const values = question.options.map((o) => o.value);
      if (new Set(values).size !== values.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'option values must be unique',
        });
      }
    }
    if (question.type === 'number' && question.min !== undefined && question.max !== undefined) {
      if (question.min > question.max) {
        ctx.addIssue({ code: 'custom', path: ['min'], message: 'must not exceed max' });
      }
    }
    if (question.type === 'multiple_choice') {
      const { minSelections, maxSelections } = question;
      if (maxSelections !== undefined && maxSelections > question.options.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['maxSelections'],
          message: 'must not exceed the number of options',
        });
      }
      if (minSelections !== undefined && maxSelections !== undefined) {
        if (minSelections > maxSelections) {
          ctx.addIssue({
            code: 'custom',
            path: ['minSelections'],
            message: 'must not exceed maxSelections',
          });
        }
      }
    }
  });

export const formDefinitionSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    questions: z.array(questionSchema).min(1).max(FORM_LIMITS.questions),
  })
  .superRefine((form, ctx) => {
    const seen = new Set<string>();
    form.questions.forEach((question, index) => {
      if (seen.has(question.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions', index, 'key'],
          message: `duplicate question key "${question.key}"`,
        });
      }
      seen.add(question.key);
    });
  });

export type FormQuestion = z.output<typeof questionSchema>;
export type FormDefinition = z.output<typeof formDefinitionSchema>;

export interface ApplicationForm {
  readonly version: string;
  readonly definition: FormDefinition;
}

// ---- Answer validation -----------------------------------------------------------

/** A validated answer value as stored in `application_answers.answer`. */
export type AnswerValue = string | number | boolean | string[];

function answerSchemaFor(question: FormQuestion): z.ZodType<AnswerValue> {
  switch (question.type) {
    case 'text':
      return z
        .string()
        .trim()
        .min(1)
        .max(question.maxLength)
        .refine(
          (value) =>
            !(question.multiline ? MULTI_LINE_FORBIDDEN : SINGLE_LINE_FORBIDDEN).test(value),
          {
            error: question.multiline
              ? 'must not contain control characters'
              : 'must not contain line breaks or control characters',
          },
        );
    case 'number': {
      let schema = z.number();
      if (question.integer) schema = schema.int();
      if (question.min !== undefined) schema = schema.min(question.min);
      if (question.max !== undefined) schema = schema.max(question.max);
      return schema;
    }
    case 'single_choice':
      return z.enum(question.options.map((o) => o.value) as [string, ...string[]]);
    case 'multiple_choice': {
      const values = z.enum(question.options.map((o) => o.value) as [string, ...string[]]);
      const min = question.minSelections ?? (question.required ? 1 : 0);
      const max = question.maxSelections ?? question.options.length;
      return z
        .array(values)
        .min(min)
        .max(max)
        .refine((selected) => new Set(selected).size === selected.length, {
          error: 'must not contain duplicates',
        });
    }
    case 'boolean':
      return z.boolean();
    case 'url':
      return z
        .string()
        .trim()
        .max(FORM_LIMITS.urlMaxLength)
        .pipe(z.url({ protocol: /^https?$/, error: 'must be an http(s) URL' }));
  }
}

/** Absent, null, "" and whitespace-only all mean "not answered". */
const notAnswered = (value: unknown) => {
  const normalized = blankToUndefined(value);
  return normalized === null ? undefined : normalized;
};

/**
 * Builds the answers validator for one form version: known keys only,
 * required questions present, each value checked against its question.
 * Output contains only answered questions.
 */
export function buildAnswersSchema(definition: FormDefinition) {
  const shape: Record<string, z.ZodType> = {};
  for (const question of definition.questions) {
    const answer = answerSchemaFor(question);
    shape[question.key] = z.preprocess(notAnswered, question.required ? answer : answer.optional());
  }
  return z.strictObject(shape).transform((answers) => {
    const answered: Record<string, AnswerValue> = {};
    for (const [key, value] of Object.entries(answers)) {
      if (value !== undefined) answered[key] = value as AnswerValue;
    }
    return answered;
  });
}

export type ValidatedAnswers = Record<string, AnswerValue>;
