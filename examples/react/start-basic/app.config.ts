import { defineConfig } from '@tanstack/start/config'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import { config } from 'vinxi/plugins/config'
import visualizer from 'rollup-plugin-visualizer'

export default defineConfig({
  vite: {
    plugins: () => [
      config('myApp', {
        resolve: {
          dedupe: ['react', 'react-dom'],
        },
        optimizeDeps: {
          exclude: ['@tanstack/start'],
        },
      }),
      TanStackRouterVite({
        experimental: {
          enableCodeSplitting: true,
        },
      }) as any,
      // visualizer({
      //   emitFile: true,
      //   filename: 'test',
      // }),
      true,
    ],
  },
})
