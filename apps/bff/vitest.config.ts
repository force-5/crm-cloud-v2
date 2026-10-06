import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Each file starts its own mock-vms + BFF; keep them isolated.
    pool: 'forks',
  },
});
