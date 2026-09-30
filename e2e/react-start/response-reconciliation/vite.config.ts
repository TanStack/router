import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

const serverEntry = process.env.TSS_E2E_SERVER_ENTRY
const outDir = process.env.E2E_DIST_DIR ?? 'dist'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  build: {
    outDir,
  },
  plugins: [
    tanstackStart({
      server: serverEntry ? { entry: serverEntry } : undefined,
    }),
    viteReact(),
  ],
})
