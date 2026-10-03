import { randomUUID } from 'node:crypto';

import type { EmailProvider, SendEmailInput } from './email-provider.js';

/**
 * Safe local email provider, used when Resend is not configured (and in
 * tests). Nothing leaves the process: messages are kept in memory (the most
 * recent `capacity`) for inspection, and only metadata is logged, never
 * recipients, subjects, or bodies. Production refuses it unless
 * EMAIL_PROVIDER=log is set explicitly.
 */

export const LOG_PROVIDER = 'log';

export interface LogProviderLogger {
  info(object: object, message: string): void;
}

export interface CapturedEmail extends SendEmailInput {
  readonly providerMessageId: string;
}

export function createLogEmailProvider(
  options: { logger?: LogProviderLogger; capacity?: number } = {},
) {
  const capacity = options.capacity ?? 100;
  const sent: CapturedEmail[] = [];
  const byIdempotencyKey = new Map<string, string>();

  const provider: EmailProvider & { readonly sent: readonly CapturedEmail[] } = {
    name: LOG_PROVIDER,
    sent,
    send(input) {
      // Same idempotency semantics as a real provider: a repeated key returns
      // the original message id and sends nothing new.
      const existing = byIdempotencyKey.get(input.idempotencyKey);
      if (existing) return Promise.resolve({ providerMessageId: existing });

      const providerMessageId = `log_${randomUUID()}`;
      byIdempotencyKey.set(input.idempotencyKey, providerMessageId);
      sent.push({ ...input, providerMessageId });
      if (sent.length > capacity) sent.shift();
      options.logger?.info(
        { providerMessageId, recipients: input.to.length, tags: input.tags },
        'email captured by log provider (not sent)',
      );
      return Promise.resolve({ providerMessageId });
    },
  };
  return provider;
}
