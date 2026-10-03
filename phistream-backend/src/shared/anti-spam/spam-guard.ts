/**
 * Provider-agnostic spam protection for public forms.
 *
 * Domain services depend only on `SpamGuard`. A guard runs a list of
 * `SpamCheck`s in order and stops at the first non-accept verdict, so cheap
 * local checks (honeypot) run before remote ones (CAPTCHA verification).
 * Rate limiting is separate (route config) and runs before any of this.
 *
 * Verdicts:
 * - `accept`:  process the submission normally.
 * - `discard`: almost certainly automated. Drop it silently and answer exactly
 *              like a success, so bots get no signal to adapt to.
 * - `reject`:  a human could plausibly have failed (e.g. an expired CAPTCHA).
 *              Tell the caller so the user can retry.
 *
 * `reason` is a short machine-readable code for logs and metrics. It must
 * never contain submitted values.
 */

export interface FormSubmission {
  /** Which form this is, e.g. "contact". Passed to verifiers as the action. */
  readonly form: string;
  /** Client IP (honours TRUST_PROXY). For verifiers only; never stored. */
  readonly remoteIp: string;
  /** Hidden field that real users leave empty. */
  readonly honeypot: string | undefined;
  /** Human-verification token from the frontend widget, if any. */
  readonly verificationToken: string | undefined;
  /** Free-text fields to inspect (e.g. the message). */
  readonly freeText: readonly string[];
}

export type SpamVerdict =
  | { readonly action: 'accept' }
  | { readonly action: 'discard'; readonly reason: string }
  | { readonly action: 'reject'; readonly reason: string };

export interface SpamCheck {
  readonly name: string;
  check(submission: FormSubmission): SpamVerdict | Promise<SpamVerdict>;
}

export interface SpamGuard {
  check(submission: FormSubmission): Promise<SpamVerdict>;
}

export const ACCEPT: SpamVerdict = { action: 'accept' };

export function createSpamGuard(checks: readonly SpamCheck[]): SpamGuard {
  return {
    async check(submission) {
      for (const spamCheck of checks) {
        const verdict = await spamCheck.check(submission);
        if (verdict.action !== 'accept') return verdict;
      }
      return ACCEPT;
    },
  };
}
