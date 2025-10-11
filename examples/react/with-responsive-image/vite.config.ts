import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import viteReact from '@vitejs/plugin-react'
import { setupPlugins } from '@responsive-image/vite-plugin'

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart(),
    viteReact(),
    setupPlugins({
      include: /^[^?]+\.(?:jpg|png)\?.*responsive.*$/,
      lqip: { type: 'thumbhash' },
    }),
  ],
})
