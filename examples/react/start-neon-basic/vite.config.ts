import postgresPlugin from '@neondatabase/vite-plugin-postgres'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  ssr: {
    noExternal: [/^@stackframe\/.*/],
  },
  server: {
    port: 3000,
  },
  plugins: [
    postgresPlugin(),
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart(),
  ],
})
