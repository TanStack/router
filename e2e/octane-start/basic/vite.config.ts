import { defineConfig } from 'vite'
import { nitro } from 'nitro/vite'
import { tanstackStart } from '@tanstack/octane-start/plugin/vite'

const outDir = process.env.E2E_DIST_DIR

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    tanstackStart(),
    nitro(
      outDir
        ? {
            output: {
              dir: outDir,
              serverDir: `${outDir}/server`,
              publicDir: `${outDir}/public`,
            },
          }
        : {},
    ),
  ],
})
