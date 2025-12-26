import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteSolid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart({
      spa: {
        enabled: true,
        prerender: {
          outputPath: 'index.html',
        },
      },
    }),
    viteSolid({ ssr: true }),
    nitro(),
  ],
})
