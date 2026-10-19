/**
 * Production client bundles carry nothing of the dev server's additions
 * (route HMR, React Refresh support): Vite, Rspack and Rsbuild. The checks
 * and their oracles are in ../production-bundle.ts; webpack's rows are in
 * build-production-webpack.test.ts (one file per bundler group, to keep each
 * file within its time budget).
 */
import { describe, test } from 'vitest'
import { frameworks } from '../build-harness'
import { expectProductionClientBundle, timeout } from '../production-bundle'

describe.each(['vite', 'rspack'] as const)('%s', (bundler) => {
  test.each(frameworks)(
    'a production %s client bundle has no dev-only code',
    async (framework) => {
      await expectProductionClientBundle(bundler, framework, true)
    },
    timeout,
  )
})

// Rsbuild with its production defaults (React apps), the router plugin of
// Rspack added as an Rsbuild app adds it.
test.each([true, false])(
  'a production react client bundle (autoCodeSplitting: %s) has no dev-only code (rsbuild)',
  async (autoCodeSplitting) => {
    await expectProductionClientBundle('rsbuild', 'react', autoCodeSplitting)
  },
  timeout,
)

test.each(['solid', 'vue'] as const)(
  'a production %s client bundle without code splitting has no dev-only code (vite)',
  async (framework) => {
    await expectProductionClientBundle('vite', framework, false)
  },
  timeout,
)

// Bug: same root cause as the pins below, on Vite: the route HMR plugin has
// no `apply: 'serve'` and follows `NODE_ENV` at plugin creation. Vite drops
// the code `import.meta.hot` guards, but not the React Refresh anchor export
// the HMR compile adds to every React route. The Vite CLI sets `NODE_ENV`
// before loading the config; Vite's JavaScript API (`build({ plugins:
// [tanstackRouter(...)] })` from a script without `NODE_ENV`) does not.
// Source: router-composed-plugin.ts (`isProduction` from `NODE_ENV`),
// router-hmr-plugin.ts (no `apply`).
// Impact: production bundles built through Vite's API keep the refresh
// anchor of every React route.
test.fails(
  'a production react client bundle without code splitting has no dev-only code (vite)',
  async () => {
    await expectProductionClientBundle('vite', 'react', false)
  },
  timeout,
)

// Bug: with automatic code splitting off, the composed router plugin adds
// the route HMR plugin unless `NODE_ENV` is `production` when the plugin is
// created (`router-composed-plugin.ts`), instead of following the bundler's
// mode; webpack and Rspack set `NODE_ENV` only inside the bundle. For every
// framework; the React row is also the pin of the control in
// known-bugs-route-hmr-production.test.ts. (webpack:
// build-production-webpack.test.ts.)
// Source: gap CC-P1 / M3.
// Impact: webpack/Rspack production bundles built from a shell without
// `NODE_ENV` ship the route HMR code of every route.
describe('rspack', () => {
  test.fails.each(frameworks)(
    'a production %s client bundle without code splitting has no dev-only code',
    async (framework) => {
      await expectProductionClientBundle('rspack', framework, false)
    },
    timeout,
  )
})
