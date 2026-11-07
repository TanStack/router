/**
 * The route asset rows (`route-assets-cases.ts`, SPEC J2.22, J5.6, J5.7) in
 * an Rsbuild production build, with and without `"sideEffects": false`
 * (without it, Rspack keeps every export another module imports through the
 * route file with the entry: SPEC J2.8), and with a chunk splitting that
 * gives every module two lazy chunks share a chunk of its own (by default
 * Rspack copies a small one into each).
 */
import { routeAssetsSuite } from './route-assets-cases'

routeAssetsSuite('rsbuild')
routeAssetsSuite('rsbuild', { sideEffects: false })
routeAssetsSuite('rsbuild', {
  sideEffects: false,
  label: 'and shared lazy modules in chunks of their own',
  rsbuildConfig: {
    splitChunks: {
      cacheGroups: {
        sharedLazy: {
          chunks: 'async',
          minChunks: 2,
          minSize: 0,
          priority: 10,
          reuseExistingChunk: true,
        },
      },
    },
  },
})
