import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * https://github.com/TanStack/router/issues/6351
 *
 * A fuzzy (unmatched-URL) 404 must be attributed to the nearest matched
 * ancestor that can actually render it: the deepest matched route with
 * children that defines a `notFoundComponent`. Attributing it to the
 * deepest matched route with children regardless of whether it has a
 * `notFoundComponent` skips pathless-layout/ancestor `notFoundComponent`s
 * and makes the framework fall back to `defaultNotFoundComponent`.
 *
 * When no matched route defines a `notFoundComponent`, the previous
 * behavior (deepest matched route with children) is preserved, and
 * `notFoundMode: 'root'` still attributes the 404 to the root route.
 */

function setup(opts: {
  layoutNotFoundComponent?: () => unknown
  agentsNotFoundComponent?: () => unknown
  notFoundMode?: 'fuzzy' | 'root'
}) {
  const rootRoute = new BaseRootRoute({})
  const layoutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    id: '_authenticated',
    notFoundComponent: opts.layoutNotFoundComponent,
  })
  const agentsRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/agents',
    notFoundComponent: opts.agentsNotFoundComponent,
  })
  const skillAgentRoute = new BaseRoute({
    getParentRoute: () => agentsRoute,
    path: '/skill-agent',
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      layoutRoute.addChildren([agentsRoute.addChildren([skillAgentRoute])]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/agents/skill-agen'] }),
    notFoundMode: opts.notFoundMode,
  })

  return { router, rootRoute, layoutRoute, agentsRoute }
}

function globalNotFoundRouteIds(router: {
  state: { matches: Array<{ routeId: string; globalNotFound?: boolean }> }
}) {
  return router.state.matches
    .filter((match) => match.globalNotFound)
    .map((match) => match.routeId)
}

test('fuzzy notFound lands on the pathless layout that defines a notFoundComponent', async () => {
  const { router, layoutRoute } = setup({
    layoutNotFoundComponent: () => 'layout not found',
  })

  await router.load()

  expect(globalNotFoundRouteIds(router)).toEqual([layoutRoute.id])
})

test('fuzzy notFound prefers the deepest matched route with a notFoundComponent', async () => {
  const { router, agentsRoute } = setup({
    layoutNotFoundComponent: () => 'layout not found',
    agentsNotFoundComponent: () => 'agents not found',
  })

  await router.load()

  expect(globalNotFoundRouteIds(router)).toEqual([agentsRoute.id])
})

test('fuzzy notFound falls back to the deepest matched route with children when no notFoundComponent exists', async () => {
  const { router, agentsRoute } = setup({})

  await router.load()

  expect(globalNotFoundRouteIds(router)).toEqual([agentsRoute.id])
})

test("notFoundMode 'root' attributes the notFound to the root route even when a layout has a notFoundComponent", async () => {
  const { router, rootRoute } = setup({
    layoutNotFoundComponent: () => 'layout not found',
    notFoundMode: 'root',
  })

  await router.load()

  expect(globalNotFoundRouteIds(router)).toEqual([rootRoute.id])
})
