/**
 * Email provider port (BUILD_PLAN Phase 7). The notifications module depends
 * only on this file; adapters (Resend, log) are chosen in the composition
 * root. Domain modules never send email: they write outbox events.
 */

export interface SendEmailInput {
  readonly from: string;
  readonly to: readonly string[];
  readonly replyTo?: string | undefined;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  /**
   * Stable per logical message (we use the delivery id). Providers that
   * support it deduplicate retries, so a message is never sent twice.
   */
  readonly idempotencyKey: string;
  /** Low-cardinality labels for provider analytics (e.g. the template id). */
  readonly tags?: Readonly<Record<string, string>> | undefined;
}

export interface SendEmailResult {
  readonly providerMessageId: string;
}

/**
 * A send that did not succeed. `code` is safe to store and log (it never
 * contains addresses or content); `retryable` says whether trying again later
 * can help (rate limits, outages) or not (invalid recipient, rejected sender).
 */
export class EmailSendError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(`email send failed: ${code}`, options);
    this.name = 'EmailSendError';
  }
}

export interface EmailProvider {
  /** Lowercase slug recorded on deliveries, e.g. "resend". */
  readonly name: string;
  /** Resolves with the provider message id or throws EmailSendError. */
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
