import { defineConfig } from 'vitest/config'

export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic', importSource: '@remix-run/ui' },
  },
  test: {
    name: '@tanstack/remix-router',
    dir: './tests',
    watch: false,
    typecheck: { enabled: true },

  },
})
