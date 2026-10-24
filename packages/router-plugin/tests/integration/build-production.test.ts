/**
 * Production client bundles carry nothing of the dev server's additions
 * (route HMR, React Refresh support): Vite, Rspack and Rsbuild. The checks
 * and their oracles are in ../production-bundle.ts; webpack's rows are in
 * build-production-webpack.test.ts (one file per bundler group, to keep each
 * file within its time budget).
 */
import { describe, test } from 'vitest'
import { frameworks } from '../build-harness'
import {
  expectProductionClientBundle,
  routeShapes,
  timeout,
} from '../production-bundle'

describe.each(['vite', 'rspack'] as const)('%s', (bundler) => {
  test.each(frameworks)(
    'a production %s client bundle has no dev-only code',
    async (framework) => {
      await expectProductionClientBundle(bundler, framework, true)
    },
    timeout,
  )

  // Routes whose route HMR compile differs from the plain route's (SPEC
  // J3.7, G7)
  test.each(
    routeShapes.filter(({ name }) =>
      [
        'a route with lowercase components',
        'a root route',
        'a root route with context',
        'an explicitly undefined component',
      ].includes(name),
    ),
  )(
    'a production client bundle of $name has no dev-only code',
    async ({ route }) => {
      await expectProductionClientBundle(bundler, 'react', true, route)
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

// The route HMR plugin also runs in these builds (it follows `NODE_ENV`,
// pinned for Rspack below); Vite drops the code `import.meta.hot` guards,
// and the export the React HMR compile adds ships only to a module that
// imports it, which the app (its route tree imports `Route`) does not
// (SPEC G9, J2.4).
test.each(frameworks)(
  'a production %s client bundle without code splitting has no dev-only code (vite)',
  async (framework) => {
    await expectProductionClientBundle('vite', framework, false)
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
