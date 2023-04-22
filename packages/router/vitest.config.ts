import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'router',
    watch: false,
    globals: true,
    environment: 'jsdom',
  },
})
