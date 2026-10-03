import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import base from './vite.config'

export default defineConfig({
  ...base,
  build: {
    ...base.build,
    outDir: 'dist-build-location',
    rollupOptions: {
      input: fileURLToPath(new URL('./build-location.html', import.meta.url)),
    },
  },
})
