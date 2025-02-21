import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { TanStackStartVitePlugin } from '@tanstack/start/plugin'

export default defineConfig({
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    TanStackStartVitePlugin(),
  ],
})
