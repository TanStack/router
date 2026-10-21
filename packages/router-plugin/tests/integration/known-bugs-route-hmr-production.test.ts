// Production-build half of the known route HMR bugs: the page pins are in
// known-bugs-route-hmr.test.ts, the in-process pins in
// ../known-bugs-route-hmr.test.ts (fast tier).
/**
 * Known route HMR bugs in production builds. Each test asserts correct
 * behaviour for a bug on main and is marked .fails; remove .fails when the
 * bug is fixed.
 */
import { describe, expect, test } from 'vitest'
import { build, head, routeApp } from '../build-harness'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'

describe('production builds', () => {
  /**
   * Builds a production client bundle with automatic code splitting on or
   * off (off: the route HMR plugin's case), the plugin's own `addHmr`
   * default and `NODE_ENV=production` (the harness's default for a
   * production build), and returns where a bundler HMR API is used.
   */
  async function hmrPlacement(bundler: Bundler, autoCodeSplitting: boolean) {
    const app = await build({
      bundler,
      env: 'client',
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

  // Control for the pin cited below: with `NODE_ENV=production` exported.
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

  // The pin of the control above (`NODE_ENV` unset: the route HMR plugin
  // follows `NODE_ENV` at plugin creation, not the bundler's mode; gap CC-P1
  // / routes.md R7) is "rspack/webpack a production react client bundle
  // without code splitting has no dev-only code" in
  // build-production.test.ts and build-production-webpack.test.ts: the same
  // build (React, automatic code splitting off, the plugin's `addHmr`
  // default, `NODE_ENV` unset), whose check of the bundlers' hot APIs
  // includes this one's.
})
