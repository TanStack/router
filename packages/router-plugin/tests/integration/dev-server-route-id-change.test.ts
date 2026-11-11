/**
 * A route registry change without a file change on each dev server: a
 * route file mounted at another path by the virtual route config (its route
 * id changes, its text does not) is compiled again with what its new id
 * decides (SPEC J1.10, J2.13; `codeSplittingOptions.splitBehavior` reads the
 * id). webpack and Rspack (through Rsbuild) run the router plugin's
 * webpack-family host; Vite its Vite host.
 */
import { test } from 'vitest'
import { expectRouteIdChangeRebuildsRoute } from '../generator-dev-scenarios'

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
