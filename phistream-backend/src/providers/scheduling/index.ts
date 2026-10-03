import type { SchedulingProviderConfig } from '../../config/env.js';
import { createCalcomProvider } from './calcom.js';
import { createMockSchedulingProvider } from './mock.js';
import type { SchedulingProvider } from './scheduling-provider.js';

/** Builds the configured provider adapter; undefined = scheduling disabled. */
export function createSchedulingProvider(
  config: SchedulingProviderConfig | undefined,
): SchedulingProvider | undefined {
  switch (config?.kind) {
    case 'calcom':
      return createCalcomProvider(config);
    case 'mock':
      return createMockSchedulingProvider(config);
    case undefined:
      return undefined;
  }
}
