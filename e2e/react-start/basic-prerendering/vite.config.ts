import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart({
      prerender: {
        enabled: true,
        filter: (page) =>
          ![
            '/this-route-does-not-exist',
            '/redirect',
            '/i-do-not-exist',
            '/not-found/via-beforeLoad',
            '/not-found/via-loader',
          ].some((p) => page.path.includes(p)),
      },
    }),
    viteReact(),
  ],
})
