import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RouterHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import { cleanup } from '@testing-library/react'
import { act } from 'react'

afterEach(() => {
  vi.resetAllMocks()
  cleanup()
})

function createTestRouter(initialHistory?: RouterHistory) {
  const history =
    initialHistory ?? createMemoryHistory({ initialEntries: ['/'] })

  const rootRoute = createRootRoute({})
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/' })

  const heavyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/heavy',
  }).lazy(() => import('./lazy-routes/heavy').then((d) => d.default('/heavy')))

  const routeTree = rootRoute.addChildren([indexRoute, heavyRoute])

  const router = createRouter({ routeTree, history })

  return {
    router,
    routes: { indexRoute, heavyRoute },
  }
}

describe('preload: matched routes', { timeout: 20000 }, () => {
  it('should wait for lazy options to be streamed in before ', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/'] }),
    )

    await router.load()

    // Preload the route and navigate to it
    router.preloadRoute({ to: '/heavy' })
    await router.navigate({ to: '/heavy' })

    await router.invalidate()

    expect(router.state.location.pathname).toBe('/heavy')

    const lazyRoute = router.routesByPath['/heavy']

    expect(lazyRoute.options.component).toBeDefined()
  })
})
