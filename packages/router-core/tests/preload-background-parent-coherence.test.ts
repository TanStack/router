import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * A preload that borrows an active parent while that parent is revalidating in
 * the background must derive descendant data from the revalidated generation.
 * Otherwise the preload can cache a child snapshot based on stale parent data,
 * then combine it with the freshly committed parent on navigation.
 */
test('child preload stays coherent with an overlapping parent background reload', async () => {
  const backgroundResponse = createControlledPromise<{ revision: number }>()
  let parentLoadCount = 0

  const parentLoader = vi.fn(() => {
    parentLoadCount++
    return parentLoadCount === 1 ? { revision: 1 } : backgroundResponse
  })
  const childLoader = vi.fn(async ({ parentMatchPromise }) => {
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

  // Let the preload reach the borrowed parent while revision 2 is still in
  // flight. This does not require the child to have started: a correct join is
  // allowed to wait for the parent response.
  await new Promise<void>((resolve) => setTimeout(resolve, 0))

  backgroundResponse.resolve({ revision: 2 })
  await childPreload

  await vi.waitFor(() => {
    const parentMatch = router.state.matches.find(
      (match) => match.routeId === parentRoute.id,
    )
    expect(parentMatch?.loaderData).toEqual({ revision: 2 })
  })

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
  expect(childMatch?.loaderData).toEqual({ parentRevision: 2 })
})
