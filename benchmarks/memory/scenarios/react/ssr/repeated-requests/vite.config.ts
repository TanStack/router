import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: rootDir,
  plugins: [
    tanstackStart({
      srcDirectory: 'src',
    }),
    react(),
  ],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    minify: false,
  },
})
