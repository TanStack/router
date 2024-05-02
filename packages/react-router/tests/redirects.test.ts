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
  // const projectRoute = createRoute({
  //   getParentRoute: () => rootRoute,
  //   path: '/project',
  // })
  // const projectFrameRoute = createRoute({
  //   getParentRoute: () => projectRoute,
  //   path: '/$framework',
  // })
  // const projectVersionRoute = createRoute({
  //   getParentRoute: () => projectFrameRoute,
  //   path: '/$version',
  // })

  const routeTree = rootRoute.addChildren([
    indexRoute,
    postsRoute.addChildren([postIdRoute]),
    // projectRoute.addChildren([
    //   projectFrameRoute.addChildren([projectVersionRoute]),
    // ]),
  ])
  const router = createRouter({ routeTree, history })

  return {
    router,
    routes: { indexRoute, postsRoute, postIdRoute },
  }
}

describe('redirects for simple route with one param', () => {
  it('router.navigate with `params` and `to`, should transition from "/posts/tanner" to "/posts/tkdodo"', async () => {
    const { router, routes } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/posts/tanner'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/posts/tanner')

    await router.navigate({
      from: router.state.resolvedLocation.pathname,
      to: routes.postIdRoute.to,
      params: (prev: any) => {
        console.log(prev)
        return { ...prev, slug: 'tkdodo' }
      },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/posts/tkdodo')
  })

  it('router.navigate with `params` and no `to`, should transition from "/posts/tanner" to "/posts/tkdodo"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/posts/tanner'] }),
    )

    await router.load()

    expect(router.state.resolvedLocation.pathname).toBe('/posts/tanner')

    await router.navigate({
      from: router.state.location.pathname,
      params: (prev: any) => ({ ...prev, slug: 'tkdodo' }),
    })
    await router.invalidate()

    // This fails but should succeed
    expect(router.state.location.pathname).toBe('/posts/tkdodo')

    // This succeeds but should fail
    // expect(router.state.location.pathname).toBe('/posts/tanner')
  })
})
