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
