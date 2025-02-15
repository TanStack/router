import { TanStackRouterEsbuild } from '@tanstack/router-plugin/esbuild'
import { solidPlugin } from 'esbuild-plugin-solid';

export default {
  // ...
  plugins: [
    TanStackRouterEsbuild({
      target: 'solid',
      autoCodeSplitting: true,
    }),
    solidPlugin(),
  ],
}
