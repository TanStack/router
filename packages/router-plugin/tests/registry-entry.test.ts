/**
 * The route registry as the compilers read it: an entry's digest and the
 * change detection cover the `routerConstructor` fact as well as the id, so
 * a plan that answered an import from the registry is re-planned when the
 * generator reports the file's Route is no longer the router's own.
 */
import { expect, test } from 'vitest'
import { changedRoutePaths, createRouterPluginContext } from '../src/context'
import { RouteRegistryView } from '../src/planners'
import type { GetRoutesByFileMapResult } from '@tanstack/router-generator'

const registry = (
  entries: Record<string, { routeId: string; routerConstructor: boolean }>,
): GetRoutesByFileMapResult => new Map(Object.entries(entries))

test('a change of routerConstructor is a registry change of that path, with another digest', () => {
  const previous = registry({
    '/app/src/routes/a.tsx': { routeId: '/a', routerConstructor: true },
    '/app/src/routes/b.tsx': { routeId: '/b', routerConstructor: false },
  })
  const next = registry({
    '/app/src/routes/a.tsx': { routeId: '/a', routerConstructor: false },
    '/app/src/routes/b.tsx': { routeId: '/b', routerConstructor: false },
  })
  expect(changedRoutePaths(next, previous)).toEqual(['/app/src/routes/a.tsx'])
  expect(changedRoutePaths(previous, previous)).toEqual([])

  const context = createRouterPluginContext()
  const view = new RouteRegistryView(context)
  context.routesByFile = previous
  const digestBefore = view.digestFor('/app/src/routes/a.tsx')
  expect(view.lookup('/app/src/routes/a.tsx')).toEqual({
    routeId: '/a',
    routerConstructor: true,
  })
  context.routesByFile = next
  expect(view.digestFor('/app/src/routes/a.tsx')).not.toBe(digestBefore)
  expect(view.digestFor('/app/src/routes/b.tsx')).toBe(
    view.digestFor('/app/src/routes/b.tsx'),
  )
  expect(view.digestFor('/app/src/routes/none.tsx')).toBeNull()
})
