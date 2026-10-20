/**
 * The route generator's watching on a running Vite dev server, on a real
 * page: edits of the virtual route config file and of a `__virtual.ts` file
 * change the live routes (pinned below), and closing the dev server stops
 * the generator (scenarios: `generator-dev-scenarios.ts`; the Rsbuild
 * counterpart is rsbuild-dev-server-generator-watching.test.ts).
 *
 * Each pin waits for the outcome of a correct generator for a bounded time
 * (`waitTimeout`, generous next to the second a correct one takes), then
 * fails.
 */
import { test } from 'vitest'
import {
  describeGeneratorWatching,
  expectVirtualRouteConfigEdit,
  expectVirtualSubtreeEdit,
} from '../generator-dev-scenarios'

/** How long a pin waits for the outcome of a correct generator. */
const waitTimeout = 4_000

describeGeneratorWatching('vite', { pinVirtualConfigEdits: true })

// Bug: an edit of the file `virtualRouteConfig` names (path form, as the
// docs configure it: './routes.ts') never reaches the live routes: the
// generator drops the dev server's update event (it compares the absolute
// event path with the configured relative path) and would load the config
// module from jiti's cache anyway.
// Source: packages/router-generator/src/generator.ts
// (`isFileRelevantForRouteTreeGeneration`), src/filesystem/virtual/
// loadConfigFile.ts (jiti import); the generator-level pin is
// router-generator tests/generator-dev.test.ts "editing the
// virtualRouteConfig file updates the route tree".
// Impact: in Vite dev, a route added to (or changed in) the virtual route
// config is missing from the app until the dev server restarts.
test.fails(
  'an edit of the virtual route config file changes the live routes',
  async () => {
    await expectVirtualRouteConfigEdit('vite', waitTimeout)
  },
  30_000,
)

// Bug: an edit of a `__virtual.ts` subtree config never reaches the live
// routes: the route tree keeps the subtree the dev server started with.
// Source (not probed in the product: a source probe was not permitted in
// this run): packages/router-generator/src/filesystem/virtual/
// loadConfigFile.ts (each load imports the config through jiti, whose
// module cache keeps the first version), reached from
// src/filesystem/physical/getRouteNodes.ts for `__virtual.ts` files.
// Impact: in Vite dev, a route added to a `__virtual.ts` file is missing
// from the app until the dev server restarts.
test.fails(
  'an edit of a __virtual.ts file changes the live routes',
  async () => {
    await expectVirtualSubtreeEdit('vite', waitTimeout)
  },
  30_000,
)
