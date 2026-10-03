import { z } from 'zod';

/**
 * Reusable Zod field schemas for public form input (contact, applications).
 *
 * Length limits match the database CHECK constraints on `leads`. Blank
 * optional fields ("" or whitespace) are treated as absent, because HTML forms
 * usually send empty strings.
 */

export const FIELD_LIMITS = {
  fullName: 200,
  email: 320,
  phone: 50,
  companyName: 200,
  attribution: 100,
  honeypot: 500,
  verificationToken: 4096,
} as const;

/** Control characters, plus Unicode line/paragraph separators. */
const SINGLE_LINE_FORBIDDEN = /[\p{Cc}\p{Zl}\p{Zp}]/u;
/** Control characters other than tab, line feed, and carriage return. */
const MULTI_LINE_FORBIDDEN = /[^\P{Cc}\t\n\r]/u;

export const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/** Optional field where "" and whitespace-only mean "not provided". */
export const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankToUndefined, schema.optional());

/**
 * Single-line text. Line breaks and control characters are rejected because
 * these values end up in email subjects/headers and admin tables.
 */
export const singleLineText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !SINGLE_LINE_FORBIDDEN.test(value), {
      error: 'must not contain line breaks or control characters',
    });

/** Multi-line text: line breaks and tabs allowed, other control characters rejected. */
export const multiLineText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !MULTI_LINE_FORBIDDEN.test(value), {
      error: 'must not contain control characters',
    });

/** Trimmed and lowercased before validation. */
export const emailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .max(FIELD_LIMITS.email)
  .pipe(z.email({ error: 'must be a valid email address' }))
  .meta({ format: 'email' });

export const phoneNumber = singleLineText(FIELD_LIMITS.phone)
  .regex(/^\+?[0-9 ().-]+$/, 'may contain digits, spaces, and + ( ) . - only')
  .refine((value) => (value.match(/\d/g)?.length ?? 0) >= 5, {
    error: 'must contain at least 5 digits',
  });

/**
 * Attribution codes such as utm_source/utm_campaign. Case-insensitive; stored
 * lowercase so "Instagram" and "instagram" group together. Lowercasing runs
 * after the pattern check so the documented pattern matches accepted input.
 */
export const attributionCode = z
  .string()
  .trim()
  .max(FIELD_LIMITS.attribution)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9 _.+-]*$/,
    'must start with a letter or digit and contain only letters, digits, spaces, and _ . + -',
  )
  .toLowerCase();

/** Contact-person fields shared by public forms. */
export const personFields = {
  name: singleLineText(FIELD_LIMITS.fullName).describe('Full name'),
  email: emailAddress.describe('Email address. Normalized to lowercase.'),
  phone: optional(phoneNumber).describe('Phone number as the person typed it'),
  companyName: optional(singleLineText(FIELD_LIMITS.companyName)),
};

/** Acquisition attribution shared by public forms. */
export const attributionFields = {
  source: optional(attributionCode).describe(
    'Acquisition source, e.g. utm_source ("instagram"). Stored lowercase.',
  ),
  campaign: optional(attributionCode).describe(
    'Campaign, e.g. utm_campaign ("bio"). Stored lowercase.',
  ),
};

/** Anti-spam inputs shared by public forms (see src/shared/anti-spam). */
export const antiSpamFields = {
  honeypot: z
    .string()
    .max(FIELD_LIMITS.honeypot)
    .optional()
    .describe(
      'Anti-spam trap. Bind to a visually hidden input that people never fill in; send it empty or omit it.',
    ),
  verificationToken: z
    .string()
    .max(FIELD_LIMITS.verificationToken)
    .optional()
    .describe(
      'Human-verification (CAPTCHA) token. Required only when a verification provider is configured.',
    ),
};
