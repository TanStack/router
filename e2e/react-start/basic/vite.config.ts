import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { e2eStartDummyServerForBuild } from '@tanstack/router-e2e-utils'
import { getStartModeConfig } from './start-mode-config'
import { isPrerender } from './tests/utils/isPrerender'

if (isPrerender) {
  await e2eStartDummyServerForBuild()
}

const outDir = process.env.E2E_DIST_DIR ?? 'dist'
const startModeConfig = getStartModeConfig()

export default defineConfig({
  resolve: { tsconfigPaths: true },
  build: {
    outDir,
  },
  server: {
    port: 3000,
  },
  plugins: [tailwindcss(), tanstackStart(startModeConfig), viteReact()],
})
