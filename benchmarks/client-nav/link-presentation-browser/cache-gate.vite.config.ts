import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import base from './vite.config'

export default defineConfig({
  ...base,
  build: {
    ...base.build,
    outDir: 'dist-cache-gate',
    rollupOptions: {
      input: fileURLToPath(new URL('./cache-gate.html', import.meta.url)),
    },
  },
})
