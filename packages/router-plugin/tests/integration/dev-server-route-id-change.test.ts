/**
 * A route registry change without a file change on each dev server: a
 * route file mounted at another path by the virtual route config (its route
 * id changes, its text does not) is compiled again with what its new id
 * decides (SPEC J1.10, J2.13; `codeSplittingOptions.splitBehavior` reads the
 * id). webpack and Rspack (through Rsbuild) run the router plugin's
 * webpack-family host; Vite its Vite host.
 */
import { expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { expectRouteIdChangeRebuildsRoute } from '../generator-dev-scenarios'
import type { WebpackPluginInstance } from 'webpack'

test.each(['webpack', 'rsbuild', 'vite'] as const)(
  'a route id change rebuilds the route module (%s dev)',
  async (bundler) => {
    await expectRouteIdChangeRebuildsRoute(bundler)
  },
  45_000,
)

// webpack with content hashes in its module snapshots
// (`snapshot.module.hash`) reports a file written again with the same text
// as modified and does not build it: a route whose id changed in that edit
// is built all the same.
test('a route id change rebuilds the route module written again unchanged (webpack dev, hash snapshots)', async () => {
  await expectRouteIdChangeRebuildsRoute('webpack', {
    rewritten: true,
    webpack: { snapshot: { module: { hash: true } } },
  })
}, 45_000)

// A rebuild of ours that fails (an app plugin's `buildModule` hook throws
// once, at the route module's build after the route id change: webpack
// reports that as an error of the compilation when it builds the module
// itself) fails one compilation, which reports it: the dev server goes on
// answering, the route is built again, and the next edit is served.
test('a failed rebuild of the route module fails one compilation, and the dev server goes on (webpack dev)', async () => {
  let builds = 0
  let failed = false
  const failsOnce: WebpackPluginInstance = {
    apply(compiler) {
      compiler.hooks.thisCompilation.tap('test-fails-once', (compilation) => {
        compilation.hooks.buildModule.tap('test-fails-once', (module) => {
          if (
            'resource' in module &&
            String(module.resource).endsWith('contact.tsx') &&
            builds++ === 1
          ) {
            failed = true
            throw new Error('the app plugin failed')
          }
        })
      })
    },
  }
  const app = await expectRouteIdChangeRebuildsRoute('webpack', {
    webpack: { plugins: [failsOnce] },
  })
  // (the plugin failed, at a rebuild of ours)
  expect(failed).toBe(true)
  expectDiagnostic(app.diagnostics(), { severity: 'error' })
  const contact = await app.read('routes/contact.tsx')
  await app.edit({
    'routes/contact.tsx': contact.replace(
      'MARK_CONTACT',
      'MARK_CONTACT_EDITED',
    ),
  })
  await app.visit('/about', 'MARK_CONTACT_EDITED')
  expect(app.errors()).toEqual([])
}, 45_000)
