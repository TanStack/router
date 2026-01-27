import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import viteSolid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    cloudflare({ viteEnvironment: { name: 'ssr' }, inspectorPort: false }),
    tanstackStart({
      prerender: {
        enabled: true,
        filter: (page) => page.path === '/static',
      },
    }),
    viteSolid({ ssr: true }),
  ],
})
