import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    watch: false,
    projects: [
      './react/vitest.config.ts',
      './solid/vitest.config.ts',
      './vue/vitest.config.ts',
    ],
  },
})
