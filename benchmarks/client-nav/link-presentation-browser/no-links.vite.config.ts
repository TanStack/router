import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import config from './vite.config'

export default defineConfig({
  ...config,
  build: {
    ...config.build,
    outDir: 'dist-no-links',
    rollupOptions: {
      input: fileURLToPath(new URL('./no-links.html', import.meta.url)),
    },
  },
})
