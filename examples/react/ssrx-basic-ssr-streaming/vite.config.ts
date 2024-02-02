import { tanstackRouterAdapter } from '@ssrx/plugin-tanstack-router/adapter'
import { ssrx } from '@ssrx/vite/plugin'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig(({ isSsrBuild, command }) => ({
  plugins: [
    tsconfigPaths(),
    react(),
    TanStackRouterVite(),
    ssrx({
      routesFile: 'src/routeTree.gen.ts',
      routerAdapter: tanstackRouterAdapter(),
    }),
  ],

  build: {
    rollupOptions: {
      output: {
        // Example of how one could break out larger more stable 3rd party libs into separate chunks for
        // improved preloading
        manualChunks:
          !isSsrBuild && command === 'build' ? manualChunks : undefined,
      },
    },
  },
}))

function manualChunks(id: string) {
  if (id.match(/node_modules\/(react\/|react-dom\/)/)) {
    return 'vendor-rendering'
  }
}
