import { createHash, randomInt } from 'node:crypto';

import type { ValidatedAnswers } from './application-form.js';

/**
 * Human-friendly application reference, e.g. "PHI-2026-7K3Q9M": for emails
 * and phone calls. NOT a credential and not secret; access control uses
 * status tokens. Crockford base32 (no I, L, O, U) avoids misreading; 6
 * characters give ~1 billion values per year. Collisions are retried by the
 * caller (unique index on `applications.reference`).
 */
const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const REFERENCE_LENGTH = 6;
export const REFERENCE_PATTERN = /^PHI-\d{4}-[0-9A-HJKMNP-TV-Z]{6}$/;

export function generateReference(now: Date): string {
  let suffix = '';
  for (let i = 0; i < REFERENCE_LENGTH; i++) {
    suffix += REFERENCE_ALPHABET.charAt(randomInt(REFERENCE_ALPHABET.length));
  }
  return `PHI-${now.getUTCFullYear()}-${suffix}`;
}

/** JSON with sorted object keys, so equal content always serializes the same. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Identifies "the same application submitted again" (double-click, retry,
 * back-button resubmit): same person, form version, tier, and answers.
 * Contact details other than the email are excluded on purpose, so fixing a
 * typo in a name does not make a resubmission look new. Multiple-choice
 * selections are order-insensitive.
 */
export function submissionFingerprint(input: {
  email: string;
  formVersion: string;
  serviceTierId: string | null;
  answers: ValidatedAnswers;
}): string {
  const answers = Object.fromEntries(
    Object.entries(input.answers).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value].sort() : value,
    ]),
  );
  return createHash('sha256')
    .update(
      canonicalJson({
        email: input.email,
        formVersion: input.formVersion,
        serviceTierId: input.serviceTierId,
        answers,
      }),
    )
    .digest('hex');
}
