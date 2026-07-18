import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * A preload only adopts an identical active lane. A child preload therefore
 * uses completed cached parent data instead of borrowing a parent from a
 * different background-revalidation lane.
 */
test('child preload does not borrow an overlapping parent background reload', async () => {
  const backgroundResponse = createControlledPromise<{ revision: number }>()
  const childLoaderStarted = createControlledPromise<void>()
  let parentLoadCount = 0

  const parentLoader = vi.fn(() => {
    parentLoadCount++
    return parentLoadCount === 1 ? { revision: 1 } : backgroundResponse
  })
  const childLoader = vi.fn(async ({ parentMatchPromise }) => {
    childLoaderStarted.resolve()
    const parentMatch = await parentMatchPromise
    return {
      parentRevision: (parentMatch.loaderData as { revision: number }).revision,
    }
  })

  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: parentLoader,
    staleTime: Infinity,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: childLoader,
    staleTime: Infinity,
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent'] }),
  })

  await router.load()
  expect(parentLoader).toHaveBeenCalledTimes(1)

  // Invalidating a successful loader uses the default background revalidation
  // mode. The public invalidate promise settles once that private reload has
  // started; its network response can remain pending.
  await router.invalidate({
    filter: (match) => match.routeId === parentRoute.id,
  })
  expect(parentLoader).toHaveBeenCalledTimes(2)

  const childPreload = router.preloadRoute({ to: '/parent/child' })

  // The child loader and background parent generation genuinely overlap, but
  // the child can use the completed cached parent generation immediately.
  await childLoaderStarted
  expect(backgroundResponse.status).toBe('pending')
  expect(parentLoader).toHaveBeenCalledTimes(2)

  backgroundResponse.resolve({ revision: 2 })
  await childPreload
  expect(parentLoader).toHaveBeenCalledTimes(2)
  expect(childLoader).toHaveBeenCalledTimes(1)

  await router.navigate({ to: '/parent/child' })

  const parentMatch = router.state.matches.find(
    (match) => match.routeId === parentRoute.id,
  )
  const childMatch = router.state.matches.find(
    (match) => match.routeId === childRoute.id,
  )

  expect(parentLoader).toHaveBeenCalledTimes(2)
  expect(childLoader).toHaveBeenCalledTimes(1)
  expect(parentMatch?.loaderData).toEqual({ revision: 2 })
  expect(childMatch?.loaderData).toEqual({ parentRevision: 1 })
})
