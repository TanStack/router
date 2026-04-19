import path from 'node:path'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { getStartModeConfig } from './start-mode-config'

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
  plugins: [tanstackStart(startModeConfig)],
  // react-tweet's package.json exports resolve to `index.client.js` which
  // matches the default **/*.client.* deny pattern.  Bundling it via
  // noExternal must NOT trigger a false-positive import-protection violation.
  ssr: {
    noExternal: ['react-tweet'],
  },
})
