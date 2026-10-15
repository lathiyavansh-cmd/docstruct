/**
 * What this file does
 *   Configures Vitest, the test runner for the API.
 *
 * How it works
 *   - Uses the 'development' condition so @docstruct/shared loads from TypeScript source.
 *   - Picks up test files in test/ and src/ ending in .test.ts.
 *   - Gives tests longer timeouts and runs test files one after another.
 *
 * Where it fits
 *   Used by `npm test` in apps/api (and by CI). Module: server core (owner: Vansh).
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Resolve @docstruct/shared to its TypeScript source during tests.
    conditions: ['development'],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // 30 s per test and 60 s per setup hook, because booting a database and running migrations is slow.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Each test file boots its own embedded database; run files one at a time to bound memory.
    fileParallelism: false,
  },
});
