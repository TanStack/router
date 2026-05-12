import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/remix-start/plugin/vite'

export default defineConfig({
  plugins: [tanstackStart()],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: '@remix-run/ui',
  },
  optimizeDeps: {
    esbuildOptions: {
      jsx: 'automatic',
      jsxImportSource: '@remix-run/ui',
    },
  },
})
