/**
 * The route generator's watching on a running Rsbuild dev server (the
 * router plugin's Rspack entry), on a real page: edits of the virtual route
 * config file and of a `__virtual.ts` file change the live routes (pinned
 * below), and closing the dev server stops the generator (scenarios:
 * `generator-dev-scenarios.ts`; the Vite counterpart is
 * dev-server-generator-watching.test.ts, with the same pins).
 *
 * Each pin waits for the outcome of a correct generator as long as the
 * passing scenarios do (`waitForLiveRoute`'s default bound), so a correct
 * but slower fix still turns it green, then fails.
 */
import { test } from 'vitest'
import {
  describeGeneratorWatching,
  expectRegistryChangeRecompilesRoute,
  expectVirtualRouteConfigEdit,
  expectVirtualSubtreeEdit,
} from '../generator-dev-scenarios'

describeGeneratorWatching('rsbuild')

// Bug: an edit of the file `virtualRouteConfig` names never reaches the
// live routes. On Rspack the file is not a module of the bundle, so the
// bundler's watcher does not report it, and the generator's own watcher
// reports only files created in the routes directory; the generator would
// also drop the event (relative/absolute path comparison) and load the
// config from jiti's cache (see the Vite pin).
// Source: packages/router-plugin/src/core/router-generator-plugin.ts
// (`rspack`: chokidar on the routes directory, 'add' only);
// packages/router-generator/src/generator.ts
// (`isFileRelevantForRouteTreeGeneration`), src/filesystem/virtual/
// loadConfigFile.ts.
// Impact: in Rsbuild/Rspack dev, a route added to the virtual route config
// is missing from the app until the dev server restarts.
test('an edit of the virtual route config file changes the live routes', async () => {
  await expectVirtualRouteConfigEdit('rsbuild')
}, 45_000)

// Bug: an edit of a `__virtual.ts` subtree config never reaches the live
// routes: the file is in no bundle and the generator's own watcher reports
// only created files; the config would also come from jiti's cache (see the
// Vite pin).
// Source: packages/router-plugin/src/core/router-generator-plugin.ts
// (`rspack`); packages/router-generator/src/filesystem/virtual/
// loadConfigFile.ts (not probed in the product).
// Impact: in Rsbuild/Rspack dev, a route added to a `__virtual.ts` file is
// missing from the app until the dev server restarts.
test('an edit of a __virtual.ts file changes the live routes', async () => {
  await expectVirtualSubtreeEdit('rsbuild')
}, 45_000)

// A route registry change without a file change (a route added to the
// virtual route config) re-plans the route file (SPEC J1.10, J2.13), a
// symlinked one too: the compiler's plans live at the real path the bundler
// resolves to, while the generator scans the link.
test.each([false, true])(
  'a route added to the virtual route config is served as a route (symlinked: %s)',
  async (linked) => {
    await expectRegistryChangeRecompilesRoute('rsbuild', linked)
  },
  45_000,
)
