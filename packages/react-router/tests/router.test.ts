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
  const routeTree = rootRoute.addChildren([
    indexRoute,
    postsRoute.addChildren([postIdRoute]),
  ])
  const router = createRouter({ routeTree, history })

  return { router, routes: { indexRoute, postsRoute, postIdRoute } }
}

describe('path params for /posts/$slug', () => {
  it('state.location.pathname / href, should have the params.slug value of "tanner"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/posts/tanner'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/posts/tanner')
  })

  it('state.location.pathname / href, should have the params.slug value of "🚀"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/posts/🚀'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/posts/🚀')
  })

  it('state.location.pathname / href, should have the params.slug value of "%F0%9F%9A%80"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/posts/%F0%9F%9A%80'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/posts/%F0%9F%9A%80')
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
})
