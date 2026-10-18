/**
 * Pins of the route generator on a running Rsbuild dev server (scenarios:
 * `generator-dev-scenarios.ts`). Each pin's controls pass on Vite (the same
 * scenario in dev-server-generator.test.ts and dev-server-new-routes.test.ts).
 *
 * The Rspack (and webpack) generator plugin watches the routes directory
 * itself only for created files; the other route file events reach it
 * through the bundler's watcher, which only watches the modules of the
 * bundle. A route file outside both never runs the generator, so nothing
 * happens at all: each pin waits for the outcome of a correct generator for
 * a bounded time (`settleTimeout`, generous next to the second a correct one
 * takes), then fails.
 */
import { test } from 'vitest'
import {
  createdBrokenRouteFiles,
  expectCreatedBrokenRouteFileFixed,
  expectPhysicalMountRouteFile,
} from '../generator-dev-scenarios'

/** How long a pin waits for the outcome of a correct generator. */
const settleTimeout = 6_000

// Control: "a created route file the generator cannot parse is reported,
// and fixing it adds the route" (dev-server-new-routes.test.ts, Vite).
// Bug: a created route file the generator leaves out of the route tree (it
// cannot parse it) is not in the bundle, so the edit that fixes it never runs
// the generator.
// Source: packages/router-plugin/src/core/router-generator-plugin.ts:93-97
// (chokidar `add` only, on the routes directory; webpack: :121-125).
// Impact: on Rsbuild, Rspack and webpack dev servers, a new route file saved
// before it exports a valid `Route` (unparsable, or no `Route` export yet:
// the same path) stays out of the route tree, keeping the path it was
// written with, until another route file is created or the dev server
// restarts.
test.fails(
  'a created route file the generator cannot parse is reported, and fixing it adds the route',
  async () => {
    await expectCreatedBrokenRouteFileFixed(
      'rsbuild',
      createdBrokenRouteFiles[0]!.initial,
      settleTimeout,
    )
  },
  30_000,
)

// Control: "a route file created, edited and deleted under a physical()
// mount outside the routes directory reaches the live routes"
// (dev-server-generator.test.ts, Vite).
// Bug: a route file created under a `physical()` mount outside the routes
// directory never runs the generator: the generator's own watcher watches the
// routes directory only, and the new file is in no bundle yet.
// Source: packages/router-plugin/src/core/router-generator-plugin.ts:93-97
// (webpack: :121-125); SPEC J1.10 makes route files under `physical()`
// mounts delivered edits like route-directory files.
// Impact: on Rsbuild, Rspack and webpack dev servers, a route created in a
// directory a virtual route config mounts with `physical()` is missing from
// the app until another route file is created in the routes directory or the
// dev server restarts.
test.fails(
  'a route file created under a physical() mount outside the routes directory reaches the live routes',
  async () => {
    await expectPhysicalMountRouteFile('rsbuild', settleTimeout)
  },
  30_000,
)
