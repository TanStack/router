import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import base from './vite.config'

export default defineConfig({
  ...base,
  build: {
    ...base.build,
    outDir: 'dist-presentation-props',
    rollupOptions: {
      input: fileURLToPath(
        new URL('./presentation-props.html', import.meta.url),
      ),
    },
  },
})
