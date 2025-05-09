import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { TanStackStartVitePlugin } from '@tanstack/react-start/plugin'

export default defineConfig({
  plugins: [
    tsConfigPaths({ projects: ['./tsconfig.json'] }),
    TanStackStartVitePlugin(),
  ],
})
