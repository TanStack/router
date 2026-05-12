import { defineConfig } from 'vite'

export default defineConfig({
  appType: 'custom',
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
