import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'router',
    watch: false,
    globals: true,
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      '@tanstack/react-store': resolve(__dirname, '..', 'react-store', 'src'),
    },
  },
})
