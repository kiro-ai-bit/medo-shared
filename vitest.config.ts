import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/tests/**/*.test.{ts,mts,mjs}'],
    environment: 'node',
    testTimeout: 30000,
  },
});
