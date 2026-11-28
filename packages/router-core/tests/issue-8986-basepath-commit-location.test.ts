import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

// https://github.com/TanStack/router/issues/8986
describe('#8986 commitLocation under a basepath', () => {
  test('navigating to a route whose public href collides with the current in-app href commits', async () => {
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const appRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/app',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, appRoute]),
      basepath: '/app',
      history: createMemoryHistory({ initialEntries: ['/app/app'] }),
    })

    await router.load()
    expect(router.state.location.pathname).toBe('/app')

    await router.navigate({ to: '/' })

    expect(router.state.location.pathname).toBe('/')
  })

  test('navigating to the current route under a basepath does not push a duplicate history entry', async () => {
    const rootRoute = new BaseRootRoute({})
    const otherRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
    })
    const history = createMemoryHistory({ initialEntries: ['/app/other'] })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([otherRoute]),
      basepath: '/app',
      history,
    })

    await router.load()
    expect(router.state.location.pathname).toBe('/other')
    const entriesBefore = history.length

    await router.navigate({ to: '/other' })

    expect(history.length).toBe(entriesBefore)
  })

  test('a rewrite.output that returns a new URL still commits a basepath-colliding navigation', async () => {
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const appRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/app',
    })
    const history = createMemoryHistory({ initialEntries: ['/app/'] })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, appRoute]),
      basepath: '/app',
      rewrite: {
        output: ({ url }) => new URL(url),
      },
      history,
    })

    await router.load()
    expect(router.state.location.pathname).toBe('/')
    const entriesBefore = history.length

    await router.navigate({ to: '/app' })

    expect(router.state.location.pathname).toBe('/app')
    expect(history.length).toBe(entriesBefore + 1)
  })
})
