import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { routeModules } from './route-modules.ts'

// The e2e build of each toolchain and mode writes to its own directory.
const outDir = process.env.E2E_DIST_DIR ?? 'dist'

export default defineConfig({
  build: {
    outDir,
  },
  plugins: [tanstackStart({ router: { routeModules } }), viteReact()],
})
