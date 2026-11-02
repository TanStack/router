import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'packages/web/tests/**/*.test.tsx'],
    // Each test runs the generator and the TypeScript compiler on a workspace.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
})
