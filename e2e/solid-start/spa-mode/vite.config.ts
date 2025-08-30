import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart({
      spa: {
        enabled: true,
        prerender: {
          outputPath: 'index.html',
          crawlLinks: true,
        },
      },
      pages: [
        {
          path: '/posts/1',
          prerender: { enabled: true, outputPath: '/posts/1/index.html' },
        },
      ],
    }),
  ],
})
