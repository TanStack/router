import { describe, expect, it } from 'vitest'

import {
  type RouterHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
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
  const projectVersionRoute = createRoute({
    getParentRoute: () => projectIdRoute,
    path: '/$version',
  })
  const projectFrameRoute = createRoute({
    getParentRoute: () => projectVersionRoute,
    path: '/$framework',
  })

  const userRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/u',
  })
  const userLayoutRoute = createRoute({
    id: '_layout',
    getParentRoute: () => userRoute,
  })
  const usernameRoute = createRoute({
    getParentRoute: () => userLayoutRoute,
    path: '$username',
  })

  const projectTree = projectRoute.addChildren([
    projectIdRoute.addChildren([
      projectVersionRoute.addChildren([projectFrameRoute]),
    ]),
  ])
  const userTree = userRoute.addChildren([
    userLayoutRoute.addChildren([usernameRoute]),
  ])

  const routeTree = rootRoute.addChildren([
    indexRoute,
    postsRoute.addChildren([postIdRoute]),
    projectTree,
    userTree,
  ])
  const router = createRouter({ routeTree, history })

  return {
    router,
    routes: {
      indexRoute,
      postsRoute,
      postIdRoute,
      projectRoute,
      projectIdRoute,
      projectVersionRoute,
      projectFrameRoute,
    },
  }
}

describe('router.navigate navigation using a single path param - object syntax for updates', () => {
  it('should change $slug in "/posts/$slug" from "tanner" to "tkdodo"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/posts/tanner'] }),
    )

    await router.load()

    expect(router.state.resolvedLocation.pathname).toBe('/posts/tanner')

    await router.navigate({
      to: '/posts/$slug',
      params: { slug: 'tkdodo' },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/posts/tkdodo')
  })

  it('should change $slug in "/posts/$slug" from "tanner" to "tkdodo" w/o "to" path being provided', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/posts/tanner'] }),
    )

    await router.load()

    expect(router.state.resolvedLocation.pathname).toBe('/posts/tanner')

    await router.navigate({
      params: { slug: 'tkdodo' },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/posts/tkdodo')
  })
})

describe('router.navigate navigation using a single path param - function syntax for updates', () => {
  it('should change $slug in "/posts/$slug" from "tanner" to "tkdodo"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/posts/tanner'] }),
    )

    await router.load()

    expect(router.state.resolvedLocation.pathname).toBe('/posts/tanner')

    await router.navigate({
      to: '/posts/$slug',
      params: (p: any) => ({ ...p, slug: 'tkdodo' }),
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/posts/tkdodo')
  })

  it('should change $slug in "/posts/$slug" from "tanner" to "tkdodo" w/o "to" path being provided', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/posts/tanner'] }),
    )

    await router.load()

    expect(router.state.resolvedLocation.pathname).toBe('/posts/tanner')

    await router.navigate({
      params: (p: any) => ({ ...p, slug: 'tkdodo' }),
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/posts/tkdodo')
  })
})

describe('router.navigate navigation using multiple path params - object syntax for updates', () => {
  it('should change $projectId in "/p/$projectId/$version/$framework" from "router" to "query"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/p/router/v1/react'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/p/router/v1/react')

    await router.navigate({
      to: '/p/$projectId/$version/$framework',
      params: { projectId: 'query' },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/p/query/v1/react')
  })

  it('should change $projectId in "/p/$projectId/$version/$framework" from "router" to "query" w/o "to" path being provided', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/p/router/v1/react'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/p/router/v1/react')

    await router.navigate({
      params: { projectId: 'query' },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/p/query/v1/react')
  })

  it('should change $version in "/p/$projectId/$version/$framework" from "v1" to "v3"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/p/router/v1/react'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/p/router/v1/react')

    await router.navigate({
      to: '/p/$projectId/$version/$framework',
      params: { version: 'v3' },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/p/router/v3/react')
  })

  it('should change $version in "/p/$projectId/$version/$framework" from "v1" to "v3" w/o "to" path being provided', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/p/router/v1/react'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/p/router/v1/react')

    await router.navigate({
      params: { version: 'v3' },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/p/router/v3/react')
  })

  it('should change $framework in "/p/$projectId/$version/$framework" from "react" to "vue"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/p/router/v1/react'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/p/router/v1/react')

    await router.navigate({
      to: '/p/$projectId/$version/$framework',
      params: { framework: 'vue' },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/p/router/v1/vue')
  })

  it('should change $framework in "/p/$projectId/$version/$framework" from "react" to "vue" w/o "to" path being provided', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/p/router/v1/react'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/p/router/v1/react')

    await router.navigate({
      params: { framework: 'vue' },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/p/router/v1/vue')
  })
})

describe('router.navigate navigation using multiple path params - function syntax for updates', () => {
  it('should change $projectId in "/p/$projectId/$version/$framework" from "router" to "query"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/p/router/v1/react'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/p/router/v1/react')

    await router.navigate({
      to: '/p/$projectId/$version/$framework',
      params: (p: any) => ({ ...p, projectId: 'query' }),
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/p/query/v1/react')
  })

  it('should change $projectId in "/p/$projectId/$version/$framework" from "router" to "query" w/o "to" path being provided', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/p/router/v1/react'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/p/router/v1/react')

    await router.navigate({
      params: (p: any) => ({ ...p, projectId: 'query' }),
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/p/query/v1/react')
  })

  it('should change $version in "/p/$projectId/$version/$framework" from "v1" to "v3"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/p/router/v1/react'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/p/router/v1/react')

    await router.navigate({
      to: '/p/$projectId/$version/$framework',
      params: (p: any) => ({ ...p, version: 'v3' }),
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/p/router/v3/react')
  })

  it('should change $version in "/p/$projectId/$version/$framework" from "v1" to "v3" w/o "to" path being provided', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/p/router/v1/react'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/p/router/v1/react')

    await router.navigate({
      params: (p: any) => ({ ...p, version: 'v3' }),
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/p/router/v3/react')
  })

  it('should change $framework in "/p/$projectId/$version/$framework" from "react" to "vue"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/p/router/v1/react'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/p/router/v1/react')

    await router.navigate({
      to: '/p/$projectId/$version/$framework',
      params: (p: any) => ({ ...p, framework: 'vue' }),
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/p/router/v1/vue')
  })

  it('should change $framework in "/p/$projectId/$version/$framework" from "react" to "vue" w/o "to" path being provided', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/p/router/v1/react'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/p/router/v1/react')

    await router.navigate({
      params: (p: any) => ({ ...p, framework: 'vue' }),
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/p/router/v1/vue')
  })
})

describe('router.navigate navigation using layout routes resolves correctly', async () => {
  it('should resolve "/u/$username" to "/u/tkdodo"', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/u/tanner'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/u/tanner')

    await router.navigate({
      to: '/u/$username',
      params: { username: 'tkdodo' },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/u/tkdodo')
  })

  it('should resolve "/u/$username" to "/u/tkdodo" w/o "to" path being provided', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/u/tanner'] }),
    )

    await router.load()

    expect(router.state.location.pathname).toBe('/u/tanner')

    await router.navigate({
      params: { username: 'tkdodo' },
    })
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/u/tkdodo')
  })
})
