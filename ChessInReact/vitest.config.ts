import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/core/**/__tests__/**/*.test.{ts,tsx}',
      'src/bindings/**/__tests__/**/*.test.{ts,tsx}',
      'src/multiplayer/**/__tests__/**/*.test.{ts,tsx}',
      'src-backend/**/__tests__/**/*.test.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/**', 'scripts/runMemoryBenchmark.js'],
    },
  },
});
