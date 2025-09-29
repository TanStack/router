import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { isSpaMode } from './tests/utils/isSpaMode'

const spaModeConfiguration = {
  enabled: true,
  prerender: {
    outputPath: 'index.html',
  },
}

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    // @ts-ignore we want to keep one test with verboseFileRoutes off even though the option is hidden
    tanstackStart({
      spa: isSpaMode ? spaModeConfiguration : undefined,
    }),
    viteReact(),
  ],
})
