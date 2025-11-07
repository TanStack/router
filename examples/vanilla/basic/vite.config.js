import { defineConfig } from 'vite'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@tanstack/vanilla-router': path.resolve(__dirname, '../../../packages/vanilla-router/src'),
    },
  },
})

