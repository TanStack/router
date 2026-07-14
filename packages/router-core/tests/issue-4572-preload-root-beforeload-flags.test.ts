import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Issue #4572: with defaultPreload 'intent', hovering a Link used to
 * re-trigger the root's beforeLoad with cause 'enter' and preload false
 * (and nested hovers reported 'enter'/false on already-active ancestors).
 *
 * Desired behavior:
 * - Hover-preloading a sibling route does not re-run beforeLoad of
 *   already-active ancestors: the preload borrows them read-only.
 * - The preloaded route's own beforeLoad sees cause 'preload' and
 *   preload true.
 * - Hover-preloading the currently active route runs no beforeLoad at all.
 */

test('hover preload does not re-run active ancestors and passes correct flags to new matches', async () => {
  const rootBeforeLoad = vi.fn()
  const indexBeforeLoad = vi.fn()
  const aboutBeforeLoad = vi.fn()
  const bagBeforeLoad = vi.fn()
  const nestedBeforeLoad = vi.fn()

  const rootRoute = new BaseRootRoute({ beforeLoad: rootBeforeLoad })
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    beforeLoad: indexBeforeLoad,
  })
  const aboutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    beforeLoad: aboutBeforeLoad,
  })
  const bagRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '_bag',
    beforeLoad: bagBeforeLoad,
  })
  const nestedRoute = new BaseRoute({
    getParentRoute: () => bagRoute,
    path: '/nested',
    beforeLoad: nestedBeforeLoad,
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      aboutRoute,
      bagRoute.addChildren([nestedRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  expect(rootBeforeLoad).toHaveBeenCalledTimes(1)
  expect(indexBeforeLoad).toHaveBeenCalledTimes(1)
  expect(rootBeforeLoad).toHaveBeenCalledWith(
    expect.objectContaining({ cause: 'enter', preload: false }),
  )

  // Hover a sibling route: the active root match is borrowed, its
  // beforeLoad must NOT be re-invoked (previously it re-ran with
  // cause 'enter' and preload false).
  await router.preloadRoute({ to: '/about' } as any)
  expect(rootBeforeLoad).toHaveBeenCalledTimes(1)
  expect(aboutBeforeLoad).toHaveBeenCalledTimes(1)
  expect(aboutBeforeLoad).toHaveBeenCalledWith(
    expect.objectContaining({ cause: 'preload', preload: true }),
  )

  // Hover the currently active route: everything is borrowed, nothing runs.
  await router.preloadRoute({ to: '/' } as any)
  expect(rootBeforeLoad).toHaveBeenCalledTimes(1)
  expect(indexBeforeLoad).toHaveBeenCalledTimes(1)
  expect(aboutBeforeLoad).toHaveBeenCalledTimes(1)

  // The report also covered a pathless parent and its nested active route.
  // After navigating there, hovering that same link must not replay any
  // ancestor's old enter/stay flags as a preload.
  await router.navigate({ to: '/_bag/nested' })
  expect(rootBeforeLoad).toHaveBeenLastCalledWith(
    expect.objectContaining({ preload: false }),
  )
  expect(bagBeforeLoad).toHaveBeenCalledWith(
    expect.objectContaining({ cause: 'enter', preload: false }),
  )
  expect(nestedBeforeLoad).toHaveBeenCalledWith(
    expect.objectContaining({ cause: 'enter', preload: false }),
  )
  expect(
    router.state.matches.some((match) => match.routeId === nestedRoute.id),
  ).toBe(true)
  rootBeforeLoad.mockClear()
  indexBeforeLoad.mockClear()
  aboutBeforeLoad.mockClear()
  bagBeforeLoad.mockClear()
  nestedBeforeLoad.mockClear()

  await router.preloadRoute({ to: '/_bag/nested' })
  expect(rootBeforeLoad).not.toHaveBeenCalled()
  expect(indexBeforeLoad).not.toHaveBeenCalled()
  expect(aboutBeforeLoad).not.toHaveBeenCalled()
  expect(bagBeforeLoad).not.toHaveBeenCalled()
  expect(nestedBeforeLoad).not.toHaveBeenCalled()
})
