import { defineConfig } from '@tanstack/start/config'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import { config } from 'vinxi/plugins/config'
import { visualizer } from 'rollup-plugin-visualizer'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  vite: {
    plugins: () => [
      tsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
      TanStackRouterVite({
        experimental: {
          enableCodeSplitting: true,
        },
      }) as any,
      visualizer({
        emitFile: true,
        filename: 'test',
      }),
    ],
  },
})
