import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import viteSolid from 'vite-plugin-solid'
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
    viteSolid({ ssr: true }),
  ],
})
