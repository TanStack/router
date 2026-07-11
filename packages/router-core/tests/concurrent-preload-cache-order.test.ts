import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
} from '../src'
import { createTestRouter } from './routerTestUtils'

test('an older preload cannot overwrite a newer preload after slower asset projection', async () => {
  const firstHead = createControlledPromise<void>()
  const secondHead = createControlledPromise<void>()
  let loaderCall = 0
  const projected: Array<number> = []

  const rootRoute = new BaseRootRoute({})
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    loader: () => ++loaderCall,
    head: async ({ loaderData }) => {
      projected.push(loaderData as number)
      await ((loaderData as number) === 1 ? firstHead : secondHead)
      return { meta: [{ name: 'revision', content: String(loaderData) }] }
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  const older = router.preloadRoute({ to: '/target' })
  const newer = router.preloadRoute({ to: '/target' })

  await vi.waitFor(() => expect(projected).toEqual([1, 2]))

  secondHead.resolve()
  await newer
  expect(
    router.stores.cachedMatches
      .get()
      .find((match) => match.routeId === targetRoute.id)?.loaderData,
  ).toBe(2)

  firstHead.resolve()
  await older

  expect(
    router.stores.cachedMatches
      .get()
      .find((match) => match.routeId === targetRoute.id)?.loaderData,
  ).toBe(2)
})
