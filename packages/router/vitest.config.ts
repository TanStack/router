import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'router',
    watch: false,
  },
  resolve: {
    alias: {
      '@tanstack/react-store': resolve(__dirname, '..', 'react-store', 'src'),
      '@tanstack/store': resolve(__dirname, '..', 'store', 'src'),
    },
  },
})
