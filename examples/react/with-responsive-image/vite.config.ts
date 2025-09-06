import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { setupPlugins } from '@responsive-image/vite-plugin'

export default defineConfig({
  plugins: [
    tanstackRouter({ autoCodeSplitting: true }),
    viteReact(),
    setupPlugins({
      include: /^[^?]+\.(?:jpg|png)\?.*responsive.*$/,
      lqip: { type: 'thumbhash' },
    }),
  ],
})
