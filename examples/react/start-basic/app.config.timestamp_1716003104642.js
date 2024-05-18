// app.config.ts
import { defineConfig } from '@tanstack/start/config'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import { visualizer } from 'rollup-plugin-visualizer'
import tsConfigPaths from 'vite-tsconfig-paths'
var app_config_default = defineConfig({
  vite: {
    plugins: () => [
      tsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
      TanStackRouterVite({
        experimental: {
          enableCodeSplitting: true,
        },
      }),
      visualizer({
        emitFile: true,
        filename: 'test',
      }),
    ],
  },
})
export { app_config_default as default }
