import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  vi.clearAllMocks()
})

function createTestRouter(initialPath: string = '/') {
  const history = createMemoryHistory({ initialEntries: [initialPath] })

  const rootRoute = createRootRoute({})
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
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
  const projectVersionRoute = createRoute({
    getParentRoute: () => projectIdRoute,
    path: '/$version',
  })
  const projectFrameRoute = createRoute({
    getParentRoute: () => projectVersionRoute,
    path: '/$framework',
  })

  const routeTree = rootRoute.addChildren([
    indexRoute,
    postsRoute.addChildren([postIdRoute]),
    projectRoute.addChildren([
      projectIdRoute.addChildren([
        projectVersionRoute.addChildren([projectFrameRoute]),
      ]),
    ]),
  ])
  const router = createRouter({ routeTree, history })

  return { router }
}

describe('router.navigate with single path param', () => {
  test('should change $slug from "tanner" to "tkdodo"', async () => {
    const { router } = createTestRouter('/posts/tanner')

    await router.load()

    expect(router.state.location.pathname).toBe('/posts/tanner')

    await router.navigate({
      to: '/posts/$slug',
      params: { slug: 'tkdodo' },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/posts/tkdodo')
  })

  test('should change $slug using function syntax', async () => {
    const { router } = createTestRouter('/posts/tanner')

    await router.load()

    expect(router.state.location.pathname).toBe('/posts/tanner')

    await router.navigate({
      to: '/posts/$slug',
      params: (p: any) => ({ ...p, slug: 'tkdodo' }),
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/posts/tkdodo')
  })
})

describe('router.navigate with multiple path params', () => {
  test('should change $projectId from "router" to "query"', async () => {
    const { router } = createTestRouter('/p/router/v1/react')

    await router.load()

    expect(router.state.location.pathname).toBe('/p/router/v1/react')

    await router.navigate({
      to: '/p/$projectId/$version/$framework',
      params: { projectId: 'query' },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/p/query/v1/react')
  })
})
