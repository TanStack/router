import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { TanStackStartVitePlugin } from '@tanstack/solid-start/plugin'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    TanStackStartVitePlugin({
      
    }),
    tailwindcss(),
  ],
})
