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
 *
 * The `physical()` mount pin is in known-bugs-rsbuild-generator-physical
 * .test.ts: each pin waits its full `settleTimeout`, so one pin per file
 * keeps each file within its time budget.
 */
import { test } from 'vitest'
import {
  createdBrokenRouteFiles,
  expectCreatedBrokenRouteFileFixed,
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
test('a created route file the generator cannot parse is reported, and fixing it adds the route', async () => {
  await expectCreatedBrokenRouteFileFixed(
    'rsbuild',
    createdBrokenRouteFiles[0]!.initial,
    settleTimeout,
  )
}, 30_000)
