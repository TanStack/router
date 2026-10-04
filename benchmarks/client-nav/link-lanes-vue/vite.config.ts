import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vueJsx from '@vitejs/plugin-vue-jsx'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  plugins: [vueJsx()],
  resolve: {
    conditions: ['browser'],
  },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: './src/main.tsx',
      formats: ['es'],
      fileName: 'app',
    },
  },
})
