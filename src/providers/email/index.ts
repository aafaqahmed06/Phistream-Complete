import type { EmailConfig } from '../../config/env.js';
import type { EmailProvider } from './email-provider.js';
import { createLogEmailProvider, type LogProviderLogger } from './log-provider.js';
import { createResendProvider } from './resend.js';

/** Builds the configured email adapter (Resend, or the local log provider). */
export function createEmailProvider(config: EmailConfig, logger: LogProviderLogger): EmailProvider {
  return config.provider.kind === 'resend'
    ? createResendProvider(config.provider)
    : createLogEmailProvider({ logger });
}
