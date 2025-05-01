import { TanStackStartVitePlugin } from '@tanstack/react-start/plugin'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    TanStackStartVitePlugin({
      prerender: {
        enabled: true,
      },
    }),
  ],
})
