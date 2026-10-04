import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  plugins: [solid({ hot: false, dev: false })],
  resolve: {
    conditions: ['solid', 'browser'],
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
