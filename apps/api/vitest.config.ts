import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Resolve @docstruct/shared to its TypeScript source during tests.
    conditions: ['development'],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Each test file boots its own embedded database; run files one at a time to bound memory.
    fileParallelism: false,
  },
});
