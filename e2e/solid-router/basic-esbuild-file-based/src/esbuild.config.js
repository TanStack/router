import { TanStackRouterEsbuild } from '@tanstack/router-plugin/esbuild'

export default {
  // ...
  plugins: [
    TanStackRouterEsbuild({
      target: "solid",
      autoCodeSplitting: true,
    }),
  ],
}
