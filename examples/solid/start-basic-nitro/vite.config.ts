import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { nitro } from 'nitro/vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import viteSolid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    nitro({ preset: 'node-server' }),
    tanstackStart({
      sitemap: { enabled: false },
      prerender: {
        enabled: true,
        filter: ({ path }) =>
          !path.startsWith('/users') &&
          !path.startsWith('/this-route-does-not-exist') &&
          !path.startsWith('/posts/i-do-not-exist') &&
          !path.startsWith('/deferred'),
      },
    }),
    viteSolid({ ssr: true }),
  ],
})
