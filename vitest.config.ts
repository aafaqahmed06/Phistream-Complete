import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    restoreMocks: true,
    // The first app build in each worker pays module-loading cost. With the
    // unit and db projects running concurrently on a busy machine this has
    // been observed above 20s, so allow generous headroom (passing tests are
    // unaffected; only a genuine hang takes this long).
    testTimeout: 60_000,
    hookTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          // Real PostgreSQL (TEST_DATABASE_URL). Files share one database and
          // each resets it, so they must run one at a time.
          name: 'db',
          include: ['tests/db/**/*.test.ts'],
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'],
      reporter: ['text', 'html'],
    },
  },
});
