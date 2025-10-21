import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import viteSolid from 'vite-plugin-solid'
import type { Plugin } from 'vite'

// Plugin to clear resolve.external for Cloudflare compatibility
function clearSsrExternal(): Plugin {
  return {
    name: 'clear-ssr-external',
    enforce: 'pre',
    configResolved(config) {
      // Clear external packages from SSR environment for Cloudflare compatibility
      const ssrEnv = config.environments.ssr
      ssrEnv.resolve.external = []
    },
  }
}

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    clearSsrExternal(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    viteSolid({ ssr: true }),
  ],
})
