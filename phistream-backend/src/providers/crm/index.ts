import type { CrmConfig } from '../../config/env.js';
import { createAttioProvider } from './attio.js';
import type { CrmProvider } from './crm-provider.js';

/** Builds the configured CRM adapter; undefined = CRM sync disabled. */
export function createCrmProvider(config: CrmConfig | undefined): CrmProvider | undefined {
  return config ? createAttioProvider(config) : undefined;
}
