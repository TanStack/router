import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [vue(), vueJsx()],
  resolve: { conditions: ['node', 'production'] },
  ssr: { noExternal: true },
  build: {
    ssr: true,
    outDir: './dist/server',
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: './src/server.tsx',
      formats: ['es'],
      fileName: () => 'server.js',
    },
    rolldownOptions: {
      platform: 'node',
      external: [/^node:/, /^vue(?:\/|$)/, /^@vue\//],
    },
  },
})
