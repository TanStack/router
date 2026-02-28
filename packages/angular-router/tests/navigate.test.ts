import { afterEach, describe, expect, it } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
})

function createTestRouter(initialEntries: Array<string>) {
  const history = createMemoryHistory({ initialEntries })

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
    path: '/p/$projectId/$version/$framework',
  })

  const uRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/u',
  })
  const uLayoutRoute = createRoute({
    getParentRoute: () => uRoute,
    id: '_layout',
  })
  const uUsernameRoute = createRoute({
    getParentRoute: () => uLayoutRoute,
    path: '$username',
  })

  const gRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/g',
  })
  const gLayoutRoute = createRoute({
    getParentRoute: () => gRoute,
    id: 'layout',
  })
  const gUsernameRoute = createRoute({
    getParentRoute: () => gLayoutRoute,
    path: '$username',
  })

  const searchRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/search',
    validateSearch: (search: Record<string, unknown>) => ({
      'foo=bar': Number(search['foo=bar'] ?? 1),
    }),
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      postsRoute.addChildren([postIdRoute]),
      projectRoute,
      uRoute.addChildren([uLayoutRoute.addChildren([uUsernameRoute])]),
      gRoute.addChildren([gLayoutRoute.addChildren([gUsernameRoute])]),
      searchRoute,
    ]),
    history,
  })

  return { router }
}

describe('router.navigate path params', () => {
  it('supports object syntax and inferred current route fallback', async () => {
    const { router } = createTestRouter(['/posts/tanner'])

    await router.load()

    await router.navigate({
      to: '/posts/$slug',
      params: { slug: 'tkdodo' },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/posts/tkdodo')

    await router.navigate({
      params: { slug: 'ryan' },
    } as any)
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/posts/ryan')
  })

  it('supports function syntax across multiple params', async () => {
    const { router } = createTestRouter(['/p/router/v1/react'])

    await router.load()

    await router.navigate({
      to: '/p/$projectId/$version/$framework',
      params: (prev: any) => ({
        ...prev,
        projectId: 'query',
        framework: 'vue',
      }),
    })

    await router.invalidate()

    expect(router.state.location.pathname).toBe('/p/query/v1/vue')
  })

  it('supports object syntax updates without `to` for multi-param routes', async () => {
    const { router } = createTestRouter(['/p/router/v1/react'])

    await router.load()

    await router.navigate({
      params: {
        projectId: 'query',
      },
    } as any)
    await router.invalidate()
    expect(router.state.location.pathname).toBe('/p/query/v1/react')

    await router.navigate({
      params: {
        version: 'v3',
        framework: 'vue',
      },
    } as any)
    await router.invalidate()
    expect(router.state.location.pathname).toBe('/p/query/v3/vue')
  })

  it('supports function syntax updates without `to` for single-param routes', async () => {
    const { router } = createTestRouter(['/posts/tanner'])

    await router.load()

    await router.navigate({
      params: (prev: any) => ({ ...prev, slug: 'tkdodo' }),
    } as any)
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/posts/tkdodo')
  })

  it('supports relative parent navigation', async () => {
    const { router } = createTestRouter(['/posts/tanner'])

    await router.load()

    await router.navigate({
      to: '..',
      from: '/posts/$slug',
      params: true,
    })

    await router.invalidate()

    expect(router.state.location.pathname).toBe('/posts')
  })

  it('supports relative child navigation', async () => {
    const { router } = createTestRouter(['/posts'])

    await router.load()

    await router.navigate({
      to: './$slug',
      from: '/posts',
      params: { slug: 'tkdodo' },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/posts/tkdodo')
  })

  it('resolves pathless layout route params via layout route id target', async () => {
    const { router } = createTestRouter(['/u/tanner'])

    await router.load()

    await router.navigate({
      to: '/u/_layout/$username',
      params: { username: 'tkdodo' },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/u/_layout/tkdodo')
  })

  it('resolves non-pathless layout route params via layout route id target', async () => {
    const { router } = createTestRouter(['/g/tanner'])

    await router.load()

    await router.navigate({
      to: '/g/layout/$username',
      params: { username: 'tkdodo' },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/g/layout/tkdodo')
  })

  it('supports search params with special characters in keys', async () => {
    const { router } = createTestRouter(['/'])

    await router.load()

    await router.navigate({
      to: '/search',
      search: { 'foo=bar': 2 },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/search')
    expect(router.state.location.search).toEqual({ 'foo=bar': 2 })
  })
})
