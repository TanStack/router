import { TanStackRouterEsbuild } from '@tanstack/router-plugin/esbuild'

export default {
  jsx: 'transform',
  minify: true,
  sourcemap: true,
  bundle: true,
  format: 'esm',
  target: ['esnext'],
  plugins: [TanStackRouterEsbuild()],
}
