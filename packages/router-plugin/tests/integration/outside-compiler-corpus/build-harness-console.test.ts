/**
 * Harness control, outside the compiler corpus (SPEC §8; SYNTHESIS B-impl
 * R/integration/build-harness.test.ts:96): the real-build harness
 * (../../build-harness.ts) records what a plugin option the build calls
 * prints with `console.warn`. A user callback marker, not a compiler
 * diagnostic: it checks the oracle's capture, not the router plugin. The
 * compiler's own warnings are decided by the corpus tests that read the
 * build's merged diagnostics (e.g. ../pages/code-splitter-plugin-pipeline.test.ts).
 * Moved from ../build-harness.test.ts.
 */
import { describe, expect, test } from 'vitest'
import { bundlers } from '@tanstack/compiler-test-utils/build-harness'
import { build, head, routeApp } from '../../build-harness'

describe.each(bundlers.filter((bundler) => bundler !== 'esbuild'))(
  'router plugin with %s',
  (bundler) => {
    // The router plugin reports what it cannot split with `console.warn`;
    // here a plugin option the build calls warns.
    test('records console warnings of the build', async () => {
      const app = await build({
        bundler,
        pluginOptions: {
          codeSplittingOptions: {
            splitBehavior: ({ routeId }) => {
              console.warn(`MARK_BUILD_WARNING ${routeId}`)
              return undefined
            },
          },
        },
        files: routeApp(`${head}export const Route = createFileRoute('/')({
  component: () => <p>page</p>,
})
`),
      })
      expect(app.consoleMessages).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          text: expect.stringContaining('MARK_BUILD_WARNING /'),
        }),
      )
    }, 60_000)
  },
)
