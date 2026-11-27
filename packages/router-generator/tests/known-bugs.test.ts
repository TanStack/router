/**
 * Known route generator bugs. Each test asserts the correct behaviour for a
 * bug main had, which today's compiler fixes (a regression test,
 * oracle/KNOWN-BUGS.md).
 */
import path from 'node:path'
import { parseSync } from 'vite'
import { describe, expect, test } from 'vitest'
import { createApp, generate, read, rootRoute } from './app'
import { routeIdOf } from './route-id'
import { routesOf } from './route-tree'

/**
 * Runs the generator on an app with a root route and `routes/moved.tsx`
 * holding `source`, like after moving a route file to `/moved`, and loads the
 * route tree with the real router; both must succeed. Returns the route file
 * as the generator wrote it.
 */
async function generateMovedRoute(
  source: string,
  otherFiles: Record<string, string> = {},
) {
  const root = await createApp({
    'routes/__root.tsx': rootRoute(),
    'routes/moved.tsx': source,
    ...otherFiles,
  })
  const { generatedRouteTree } = await generate(root, {
    routesDirectory: path.join(root, 'routes'),
    generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
  })
  await routesOf(generatedRouteTree)
  return read(root, 'routes/moved.tsx')
}

// (What Start learns of a route's option keys from the generator, which
// decides whether a route is server-only, is tested through Start's builds:
// start-plugin-core tests/known-bugs-route-options.test.ts.)

describe('route constructor imports', () => {
  // Bug: the route constructor call is recognized by its callee name, apart
  // from its import: an aliased import (`createFileRoute as route`) is not
  // recognized.
  // Impact: the route keeps its old id when its file moves.
  test('a moved route with an aliased import of the constructor gets the id of its new path', async () => {
    const written =
      await generateMovedRoute(`import { createFileRoute as route } from '@tanstack/react-router'
export const Route = route('/old')({})`)
    expect(await routeIdOf(written)).toBe('/moved')
  })

  // Bug: same root cause as above, for `createFileRoute` imported from a
  // module of the app (a wrapper re-exporting it): no import from the
  // router package names it, so the generator prepends one, next to the
  // user's import of the same name.
  // Source: router-generator/src/transform/transform.ts:502-565
  // (`normalizeRouteImports` adds the import when no import of the router
  // package owns the constructor); fuzzing, 7 unmodified files of real apps.
  // Impact: the written route file declares `createFileRoute` twice and no
  // longer parses, so the app fails to build.
  test('a moved route importing createFileRoute from a module of the app stays a valid module', async () => {
    const written = await generateMovedRoute(
      `import { createFileRoute } from '../lib/router'
export const Route = createFileRoute('/old')({})`,
      {
        'lib/router.ts': `export { createFileRoute } from '@tanstack/react-router'`,
      },
    )
    const { errors } = parseSync('route.tsx', written, {
      sourceType: 'module',
      showSemanticErrors: true,
    })
    expect(errors.map((error) => error.message)).toEqual([])
  })
})
