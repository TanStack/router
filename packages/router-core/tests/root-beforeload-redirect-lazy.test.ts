import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, redirect } from '../src'
import { createTestRouter } from './routerTestUtils'

test('root beforeLoad redirect from published pending UI finishes a lazy target load', async () => {
  let shouldRedirect = true

  const rootRoute = new BaseRootRoute({
    pendingMs: 0,
    pendingComponent: {},
    beforeLoad: async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
      if (shouldRedirect) {
        shouldRedirect = false
        throw redirect({ to: '/posts' })
      }
    },
  })
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const postsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
  }).lazy(() => Promise.resolve({ options: {} } as any))

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()

  expect(router.state.location.pathname).toBe('/posts')
  expect(router.state.matches.map((match) => match.routeId)).toEqual([
    rootRoute.id,
    postsRoute.id,
  ])
  expect(router.state.matches.every((match) => match.status === 'success')).toBe(
    true,
  )
  expect(router.latestLoadPromise).toBeUndefined()
  expect(router.stores.isLoading.get()).toBe(false)
})
