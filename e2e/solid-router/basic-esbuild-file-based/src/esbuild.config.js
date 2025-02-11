import { TanStackRouterEsbuild } from '@tanstack/router-plugin/esbuild'

export default {
  // ...
  plugins: [
    TanStackRouterEsbuild({
      autoCodeSplitting: true,
    }),
  ],
}
