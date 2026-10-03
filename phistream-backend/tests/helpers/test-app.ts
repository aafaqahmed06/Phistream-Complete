import { buildApp } from '../../src/app.js';
import { loadConfig, type AppConfig } from '../../src/config/env.js';

export const BASE_TEST_ENV = { NODE_ENV: 'test', LOG_LEVEL: 'silent' } as const;

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({ ...BASE_TEST_ENV, ...overrides });
}

export async function buildTestApp(
  overrides: Record<string, string> = {},
  options: { logStream?: { write(message: string): void } } = {},
) {
  return buildApp({ config: testConfig(overrides), ...options });
}

/** Collects pino JSON log lines written by the app. */
export function createLogCollector() {
  const lines: string[] = [];
  return {
    stream: {
      write: (message: string) => {
        lines.push(message);
      },
    },
    get text() {
      return lines.join('');
    },
  };
}
