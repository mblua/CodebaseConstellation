import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Everything above the renderer adapter is pure and runs headless.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
    testTimeout: 30_000,
  },
});
