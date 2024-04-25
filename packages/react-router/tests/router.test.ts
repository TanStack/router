import { describe, it, expect } from 'vitest'

import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  type RouterHistory,
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
  const topLevelSplatRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '$',
  })
  const routeTree = rootRoute.addChildren([
    indexRoute,
    postsRoute.addChildren([postIdRoute]),
    topLevelSplatRoute,
  ])
  const router = createRouter({ routeTree, history })

  return {
    router,
    routes: { indexRoute, postsRoute, postIdRoute, topLevelSplatRoute },
  }
}

describe('encoding: path params for /posts/$slug', () => {
  it('state.location.pathname, should have the params.slug value of "tanner"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/posts/tanner'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/posts/tanner')
  })

  it('state.location.pathname, should have the params.slug value of "🚀"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/posts/🚀'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/posts/🚀')
  })

  it('state.location.pathname, should have the params.slug value of "%F0%9F%9A%80"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/posts/%F0%9F%9A%80'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/posts/%F0%9F%9A%80')
  })

  it('state.location.pathname, should have the params.slug value of "framework%2Freact%2Fguide%2Ffile-based-routing%20tanstack"', async () => {
    const unencoded = 'framework/react/guide/file-based-routing tanstack'

    const { router } = createTestRouter(
      createMemoryHistory({
        initialEntries: [`/posts/${encodeURIComponent(unencoded)}`],
      }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe(
      `/posts/${encodeURIComponent(unencoded)}`,
    )
  })

  it('params.slug for the matched route, should be "tanner"', async () => {
    const { router, routes } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/posts/tanner'] }),
    )

    await router.load()

    const match = router.state.matches.find(
      (r) => r.routeId === routes.postIdRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any).slug).toBe('tanner')
  })

  it('params.slug for the matched route, should be "🚀"', async () => {
    const { router, routes } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/posts/🚀'] }),
    )

    await router.load()

    const match = router.state.matches.find(
      (r) => r.routeId === routes.postIdRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any).slug).toBe('🚀')
  })

  it('params.slug for the matched route, should be "🚀" instead of it being "%F0%9F%9A%80"', async () => {
    const { router, routes } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/posts/%F0%9F%9A%80'] }),
    )

    await router.load()

    const match = router.state.matches.find(
      (r) => r.routeId === routes.postIdRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any).slug).toBe('🚀')
  })

  it('params.slug for the matched route, should be "framework/react/guide/file-based-routing tanstack" instead of it being "framework%2Freact%2Fguide%2Ffile-based-routing%20tanstack"', async () => {
    const unencoded = 'framework/react/guide/file-based-routing tanstack'

    const { router, routes } = createTestRouter(
      createMemoryHistory({
        initialEntries: [`/posts/${encodeURIComponent(unencoded)}`],
      }),
    )

    await router.load()

    const match = router.state.matches.find(
      (r) => r.routeId === routes.postIdRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any).slug).toBe(unencoded)
  })
})

describe('encoding: splat param for /$', () => {
  it('state.location.pathname, should have the params._splat value of "tanner"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/tanner'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/tanner')
  })

  it('state.location.pathname, should have the params._splat value of "🚀"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/🚀'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/🚀')
  })

  it('state.location.pathname, should have the params._slug value of "%F0%9F%9A%80"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/%F0%9F%9A%80'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/%F0%9F%9A%80')
  })

  it('state.location.pathname, should have the params._splat value of "framework%2Freact%2Fguide%2Ffile-based-routing%20tanstack"', async () => {
    const unencoded = 'framework/react/guide/file-based-routing tanstack'

    const { router } = createTestRouter(
      createMemoryHistory({
        initialEntries: [`/${encodeURIComponent(unencoded)}`],
      }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe(
      `/${encodeURIComponent(unencoded)}`,
    )
  })

  it('state.location.pathname, should have the params._splat value of "framework/react/guide/file-based-routing tanstack"', async () => {
    const value = 'framework/react/guide/file-based-routing tanstack'

    const { router } = createTestRouter(
      createMemoryHistory({
        initialEntries: [`/${value}`],
      }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe(`/${value}`)
  })

  it('params._splat for the matched route, should be "tanner"', async () => {
    const { router, routes } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/tanner'] }),
    )

    await router.load()

    const match = router.state.matches.find(
      (r) => r.routeId === routes.topLevelSplatRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any)._splat).toBe('tanner')
  })

  it('params._splat for the matched route, should be "🚀"', async () => {
    const { router, routes } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/🚀'] }),
    )

    await router.load()

    const match = router.state.matches.find(
      (r) => r.routeId === routes.topLevelSplatRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any)._splat).toBe('🚀')
  })

  it('params._splat for the matched route, should be "🚀" instead of it being "%F0%9F%9A%80"', async () => {
    const { router, routes } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/%F0%9F%9A%80'] }),
    )

    await router.load()

    const match = router.state.matches.find(
      (r) => r.routeId === routes.topLevelSplatRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any)._splat).toBe('🚀')
  })

  it('params._splat for the matched route, should be "framework/react/guide/file-based-routing tanstack"', async () => {
    const value = 'framework/react/guide/file-based-routing tanstack'

    const { router, routes } = createTestRouter(
      createMemoryHistory({
        initialEntries: [`/${value}`],
      }),
    )

    await router.load()

    const match = router.state.matches.find(
      (r) => r.routeId === routes.topLevelSplatRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any)._splat).toBe(value)
  })
})
