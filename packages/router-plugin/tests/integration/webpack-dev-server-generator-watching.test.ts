/**
 * The route generator's watching in webpack dev (`webpack-dev-server` with
 * the router plugin's webpack entry): the rows of
 * dev-server-generator-watching.test.ts (Vite) and
 * rsbuild-dev-server-generator-watching.test.ts (Rsbuild) whose mechanism
 * is the router's webpack-family host.
 */
import { test } from 'vitest'
import { expectRegistryChangeRecompilesRoute } from '../generator-dev-scenarios'

// A route registry change without a file change (a route added to the
// virtual route config) re-plans the route file (SPEC J1.10, J2.13), a
// symlinked one too: the compiler's plans live at the real path the bundler
// resolves to, while the generator scans the link.
test.each([false, true])(
  'a route added to the virtual route config is served as a route (symlinked: %s)',
  async (linked) => {
    await expectRegistryChangeRecompilesRoute('webpack', linked)
  },
  45_000,
)
