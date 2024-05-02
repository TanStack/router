import { describe, expect, it } from 'vitest'

import {
  type RouterHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

function createTestRouter(initialHistory?: RouterHistory) {
  const history =
    initialHistory ?? createMemoryHistory({ initialEntries: ['/'] })

  const rootRoute = createRootRoute({})
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/' })
  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
  })
  const postIdRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '/$slug',
  })
  const projectRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/p',
  })
  const projectIdRoute = createRoute({
    getParentRoute: () => projectRoute,
    path: '/$projectId',
  })
  const projectFrameRoute = createRoute({
    getParentRoute: () => projectIdRoute,
    path: '/$framework',
  })
  const projectVersionRoute = createRoute({
    getParentRoute: () => projectFrameRoute,
    path: '/$version',
  })

  const routeTree = rootRoute.addChildren([
    indexRoute,
    postsRoute.addChildren([postIdRoute]),
    projectRoute.addChildren([
      projectIdRoute.addChildren([projectFrameRoute.addChildren([projectVersionRoute])]),
    ]),
  ])
  const router = createRouter({ routeTree, history })

  return {
    router,
    routes: { indexRoute, postsRoute, postIdRoute },
  }
}

describe('redirects for simple route with one param', () => {
  it('"/posts/tanner" to "/posts/tkdodo"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/posts/tanner'] }),
    )

    await router.load()

    expect(router.state.resolvedLocation.pathname).toBe('/posts/tanner')

    await router.navigate({
      params: (prev: any) => ({ ...prev, slug: 'tkdodo' }),
    })
    await router.invalidate()

    // This fails but should succeed
    expect(router.state.location.pathname).toBe('/posts/tkdodo')
  })
})

describe('redirects for complex route with two params', () => {
  it('"/p/router/react/v1 to /p/router/react/v3"', async () => {
    const { router, routes } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/p/router/react/v1'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/p/router/react/v1')

    await router.navigate({
      params: (prev: any) => {
        return { ...prev, version: 'v3' }
      },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/p/router/react/v3')
  })

  it('"/p/router/latest/react to /p/router/latest/vue"', async () => {
    const { router, routes } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/p/router/latest/react'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/p/router/latest/react')

    await router.navigate({
      params: (prev: any) => {
        return { ...prev, framework: 'vue' }
      },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/p/router/latest/vue')
  })

  it('"/p/router/latest/react to /p/router/latest/react?framework=vue"', async () => {
    const { router, routes } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/p/form/latest/angular'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/p/form/latest/angular')

    await router.navigate({
      params: (prev: any) => {
        return { ...prev, projectId: 'query' }
      },
    });
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/p/query/latest/angular')
  })

  it('"/p/table/latest/angular to /p/router/latest/react"', async () => {
    const { router, routes } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/p/table/latest/angular'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/p/table/latest/angular')

    await router.navigate({
      params: (prev: any) => {
        return { ...prev, projectId: 'router', framework: 'react' }
      },
    });
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/p/router/latest/react')
  })
})

