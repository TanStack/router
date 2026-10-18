// Production-build half of the known route HMR bugs: the page pins are in
// known-bugs-route-hmr.test.ts, the in-process pins in
// ../known-bugs-route-hmr.test.ts (fast tier).
/**
 * Known route HMR bugs in production builds. Each test asserts correct
 * behaviour for a bug on main and is marked .fails; remove .fails when the
 * bug is fixed.
 */
import { describe, expect, test } from 'vitest'
import { build, routeApp } from '../build-harness'
import { head } from '../regression-helpers'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'

describe('production builds', () => {
  /**
   * Builds a production client bundle with automatic code splitting on or
   * off (off: the route HMR plugin's case), the plugin's own `addHmr`
   * default and `NODE_ENV` as given (`null`: unset), and returns where a
   * bundler HMR API is used.
   */
  async function hmrPlacement(
    bundler: Bundler,
    autoCodeSplitting: boolean,
    nodeEnv?: null,
  ) {
    const app = await build({
      bundler,
      env: 'client',
      nodeEnv,
      pluginOptions: {
        autoCodeSplitting,
        codeSplittingOptions: { addHmr: undefined },
      },
      files: routeApp(
        `${head}function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
        { env: 'client' },
      ),
    })
    return app.where(/import\.meta\.(?:webpackHot|hot)\b|\bmodule\.hot\b/)
  }

  // No Vite rows: Vite replaces `import.meta.hot` with `undefined` in a
  // build and drops the code it guards, so they could not fail.

  // Control for the pin below: with `NODE_ENV=production` exported.
  test.each(['rspack', 'webpack'] as const)(
    'a production client bundle has no route HMR code (%s)',
    async (bundler) => {
      expect(await hmrPlacement(bundler, false)).toBe('nowhere')
    },
    60_000,
  )

  // Source: gap P1 / DV51. (No esbuild row: the esbuild plugin neither
  // generates nor splits routes, pinned in build-harness.test.ts, so it
  // could not fail.)
  test.each(['rspack', 'webpack'] as const)(
    'a production client bundle with automatic code splitting has no route HMR code (%s)',
    async (bundler) => {
      expect(await hmrPlacement(bundler, true)).toBe('nowhere')
    },
    60_000,
  )

  // Bug: with automatic code splitting off, the composed router plugin adds
  // the route HMR plugin unless `NODE_ENV` is `production` when the plugin is
  // created (`router-composed-plugin.ts`), instead of following the
  // bundler's mode. webpack and Rspack set `NODE_ENV` only inside the bundle.
  // Source: gap CC-P1 / routes.md R7.
  // Impact: webpack/Rspack production bundles built from a shell without
  // `NODE_ENV` ship the route HMR code of every route.
  test.fails.each(['rspack', 'webpack'] as const)(
    'a production client bundle has no route HMR code when NODE_ENV is unset (%s)',
    async (bundler) => {
      expect(await hmrPlacement(bundler, false, null)).toBe('nowhere')
    },
    60_000,
  )
})
