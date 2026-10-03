import { z } from 'zod';

import { EmailSendError, type EmailProvider } from './email-provider.js';

/**
 * Resend adapter (REST, no SDK). Everything Resend-specific lives here.
 *
 *   POST {base}/emails
 *   Authorization: Bearer <RESEND_API_KEY>
 *   Idempotency-Key: <delivery id>     (Resend deduplicates for 24 hours)
 *   { from, to, subject, html, text, reply_to?, tags? }  →  200 { id }
 *
 * The API key is only ever sent to Resend. Error handling classifies by HTTP
 * status and Resend's error `name`. Resend error *messages* can quote the
 * submitted addresses, so they are never stored or logged.
 */

export interface ResendConfig {
  readonly apiKey: string;
  readonly apiBaseUrl: string;
}

export const RESEND_PROVIDER = 'resend';

const successBody = z.object({ id: z.string().min(1).max(200) });
const errorBody = z.object({ name: z.string().max(100).optional() });

/** Resend tag names/values allow ASCII letters, numbers, underscores, dashes. */
function tagValue(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256);
}

export function createResendProvider(
  config: ResendConfig,
  deps: { fetch?: typeof fetch; timeoutMs?: number } = {},
): EmailProvider {
  const doFetch = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 10_000;

  return {
    name: RESEND_PROVIDER,

    async send(input) {
      const body = {
        from: input.from,
        to: [...input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        ...(input.tags
          ? {
              tags: Object.entries(input.tags).map(([name, value]) => ({
                name: tagValue(name),
                value: tagValue(value),
              })),
            }
          : {}),
      };

      let response: Response;
      try {
        response = await doFetch(`${config.apiBaseUrl}/emails`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            'content-type': 'application/json',
            'idempotency-key': input.idempotencyKey,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const code =
          error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network';
        throw new EmailSendError(`resend_${code}`, true, { cause: error });
      }

      const json: unknown = await response.json().catch(() => undefined);
      if (response.ok) {
        const parsed = successBody.safeParse(json);
        if (!parsed.success) throw new EmailSendError('resend_unexpected_response', true);
        return { providerMessageId: parsed.data.id };
      }

      const name = errorBody.safeParse(json).data?.name;
      const code = `resend_${response.status}${name ? `_${tagValue(name)}` : ''}`;
      // 429 and 5xx are transient; 409 = idempotency conflict (a concurrent
      // request with the same key) is retried and then resolves. Other 4xx
      // (bad key, unverified domain, invalid recipient) need a human.
      const retryable =
        response.status === 429 || response.status === 409 || response.status >= 500;
      throw new EmailSendError(code, retryable);
    },
  };
}
