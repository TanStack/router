import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    watch: false,
    environment: 'node',
    include: ['*.test.ts'],
  },
})
