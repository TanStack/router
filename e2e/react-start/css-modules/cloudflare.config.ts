import { defineConfig } from 'cf/config'

// Used by rsbuild-plugin-cloudflare (E2E_RSBUILD_CLOUDFLARE=true).
// The Vite Cloudflare variant still reads wrangler.jsonc.
export default defineConfig({
  worker: {
    name: 'tanstack-start-css-modules',
    entrypoint: '@tanstack/react-start/server-entry',
    compatibilityDate: '2026-11-01',
  },
})
