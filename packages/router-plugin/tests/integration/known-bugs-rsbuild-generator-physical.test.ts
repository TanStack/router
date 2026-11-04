/**
 * Regression tests of the route generator on a running Rsbuild dev server
 * (scenarios: `generator-dev-scenarios.ts`); their controls run on Vite (the
 * same scenario in dev-server-generator.test.ts and
 * dev-server-new-routes.test.ts).
 *
 * On main, the Rspack (and webpack) generator plugin watched the routes
 * directory itself only for created files; the other route file events
 * reached it through the bundler's watcher, which only watches the modules
 * of the bundle. A route file outside both never ran the generator, so
 * nothing happened at all: each test waits for the outcome of a correct
 * generator for a bounded time (`settleTimeout`, generous next to the second
 * a correct one takes).
 *
 * The created broken route file test is in known-bugs-rsbuild-generator.test.ts
 * (one per file: a failing test waits its full `settleTimeout`).
 */
import { test } from 'vitest'
import { expectPhysicalMountRouteFile } from '../generator-dev-scenarios'

/** How long a pin waits for the outcome of a correct generator. */
const settleTimeout = 6_000

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
test('a route file created under a physical() mount outside the routes directory reaches the live routes', async () => {
  await expectPhysicalMountRouteFile('rsbuild', settleTimeout)
}, 30_000)
