import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, notFound } from '../src'
import {
  assertIsolatedRouteLoaded,
  assertRouteTestParams,
  createIsolatedRouteTree,
  createIsolatedTestRouterWith,
  createTestRouteTree,
  createTestRouterWith,
  initRouteTree,
  setTestRouterLocation,
} from '../src/testing'
import { createTestRouter } from './routerTestUtils'
import type { AnyRoute } from '../src'

function createTree() {
  const calls: Array<string> = []
  const loadLazyRoute = vi.fn(() =>
    Promise.resolve({ options: { component: 'lazy component' } } as any),
  )

  const rootRoute = new BaseRootRoute({
    beforeLoad: () => {
      calls.push('root.beforeLoad')
      return { session: 'real session' }
    },
    component: 'root component',
    shellComponent: 'root shell',
  })

  const layoutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    id: 'layout',
    loader: () => {
      calls.push('layout.loader')
      return 'real layout data'
    },
    component: 'layout component',
  })

  const postRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/posts/$postId',
    params: {
      parse: (params: { postId: string }) => {
        if (params.postId === 'missing') {
          throw notFound()
        }
        return params
      },
    },
    validateSearch: (search: Record<string, unknown>) => {
      if (search.tab === 'broken') {
        throw new Error('Unknown tab')
      }
      if (search.tab === 'missing') {
        throw notFound()
      }
      return { tab: (search.tab as string | undefined) ?? 'details' }
    },
    context: () => {
      calls.push('post.context')
      return { scope: 'real scope' }
    },
    beforeLoad: () => {
      calls.push('post.beforeLoad')
      return { permission: 'real permission' }
    },
    loader: () => {
      calls.push('post.loader')
      return 'real post data'
    },
    onEnter: () => {
      calls.push('post.onEnter')
    },
    component: 'post component',
    errorComponent: 'post error component',
  })

  const lazyRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/lazy',
  }).lazy(loadLazyRoute)

  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })

  const routeTree = rootRoute.addChildren([
    layoutRoute.addChildren([postRoute]),
    lazyRoute,
    indexRoute,
  ])

  return { routeTree, rootRoute, layoutRoute, postRoute, calls, loadLazyRoute }
}

function createRouter(routeTree: AnyRoute, href: string) {
  return createTestRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [href] }),
    context: { locale: 'en' },
  })
}

function getMatch(router: ReturnType<typeof createRouter>, routeId: string) {
  return router.state.matches.find((match) => match.routeId === routeId)
}

describe('initRouteTree', () => {
  test('gives every route its id and paths without a router', () => {
    const { routeTree, layoutRoute, postRoute } = createTree()
    expect(postRoute.id).toBeUndefined()

    initRouteTree(routeTree)

    expect(routeTree.id).toBe('__root__')
    expect(layoutRoute.id).toBe('/layout')
    expect(postRoute.id).toBe('/layout/posts/$postId')
    expect(postRoute.fullPath).toBe('/posts/$postId')
    expect(postRoute.to).toBe('/posts/$postId')
    expect(postRoute.parentRoute).toBe(layoutRoute)
  })

  test('initialises routes added to a tree that a router has processed', () => {
    const { routeTree, rootRoute } = createTree()
    createRouter(routeTree, '/')
    const aboutRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
    })
    rootRoute.addChildren([
      ...(rootRoute.children as Array<AnyRoute>),
      aboutRoute,
    ])

    expect(() =>
      createTestRouteTree(routeTree, {
        '/about': { loaderData: 'seeded about data' },
      }),
    ).not.toThrow()
    expect(aboutRoute.id).toBe('/about')
    expect(aboutRoute.to).toBe('/about')
  })
})

describe('createTestRouteTree', () => {
  test('copies every route and leaves the original tree untouched', async () => {
    const { routeTree, postRoute, calls } = createTree()
    const originalOptions = { ...postRoute.options }

    const testTree = createTestRouteTree(routeTree, {
      '/layout/posts/$postId': { loaderData: 'seeded post data' },
    })
    const router = createRouter(testTree, '/posts/1')
    await router.load()

    const testPostRoute = router.routesById['/layout/posts/$postId']!
    expect(testPostRoute).not.toBe(postRoute)
    expect(testPostRoute).toBeInstanceOf(BaseRoute)
    expect(testPostRoute.parentRoute).toBe(router.routesById['/layout'])
    expect(testPostRoute.parentRoute).not.toBe(postRoute.parentRoute)
    expect(router.routesById['__root__']).toBeInstanceOf(BaseRootRoute)
    expect(postRoute.options).toEqual(originalOptions)
    expect(getMatch(router, '/layout/posts/$postId')?.loaderData).toBe(
      'seeded post data',
    )
    expect(calls).not.toContain('post.loader')

    // The route objects that application code holds are initialised too.
    expect(postRoute.id).toBe('/layout/posts/$postId')
    expect(postRoute.to).toBe('/posts/$postId')
  })

  test('runs the options of the application for routes without an override', async () => {
    const { routeTree, calls } = createTree()

    const router = createRouter(createTestRouteTree(routeTree), '/posts/1')
    await router.load()

    expect(calls).toEqual([
      'root.beforeLoad',
      'post.context',
      'post.beforeLoad',
      'layout.loader',
      'post.loader',
      'post.onEnter',
    ])
    expect(getMatch(router, '/layout/posts/$postId')?.context).toEqual({
      locale: 'en',
      session: 'real session',
      scope: 'real scope',
      permission: 'real permission',
    })
  })

  test('takes routeContext as a seed for everything the route contributes', async () => {
    const { routeTree, calls } = createTree()

    const router = createRouter(
      createTestRouteTree(routeTree, {
        '/layout/posts/$postId': { routeContext: { scope: 'seeded scope' } },
      }),
      '/posts/1',
    )
    await router.load()

    expect(calls).not.toContain('post.context')
    expect(calls).not.toContain('post.beforeLoad')
    expect(getMatch(router, '/layout/posts/$postId')?.context).toEqual({
      locale: 'en',
      session: 'real session',
      scope: 'seeded scope',
    })
  })

  test('replaces the context option, beforeLoad and the loader with functions', async () => {
    const { routeTree, calls } = createTree()
    const loader = vi.fn(({ params }: { params: { postId: string } }) => {
      return `replaced data for ${params.postId}`
    })

    const router = createRouter(
      createTestRouteTree(routeTree, {
        '/layout/posts/$postId': {
          context: () => ({ scope: 'replaced scope' }),
          beforeLoad: () => ({ permission: 'replaced permission' }),
          loader,
        },
      }),
      '/posts/7',
    )
    await router.load()

    const match = getMatch(router, '/layout/posts/$postId')
    expect(match?.context).toEqual({
      locale: 'en',
      session: 'real session',
      scope: 'replaced scope',
      permission: 'replaced permission',
    })
    expect(match?.loaderData).toBe('replaced data for 7')
    expect(calls).toEqual(['root.beforeLoad', 'layout.loader', 'post.onEnter'])
  })

  test('seeds loader data and replaces components', async () => {
    const { routeTree, calls } = createTree()

    const router = createRouter(
      createTestRouteTree(routeTree, {
        '/layout': { loaderData: 'seeded layout data' },
        '/layout/posts/$postId': { component: 'test component' },
      }),
      '/posts/1',
    )
    await router.load()

    expect(getMatch(router, '/layout')?.loaderData).toBe('seeded layout data')
    expect(calls).not.toContain('layout.loader')
    expect(router.routesById['/layout/posts/$postId']!.options.component).toBe(
      'test component',
    )
  })

  test('lets an override win over the options of a lazy route', async () => {
    const { routeTree, loadLazyRoute } = createTree()

    const real = createRouter(createTestRouteTree(routeTree), '/lazy')
    await real.load()
    expect(real.routesById['/lazy']!.options.component).toBe('lazy component')

    const overridden = createRouter(
      createTestRouteTree(routeTree, {
        '/lazy': { component: 'test component' },
      }),
      '/lazy',
    )
    await overridden.load()
    expect(overridden.routesById['/lazy']!.options.component).toBe(
      'test component',
    )
    expect(loadLazyRoute).toHaveBeenCalledTimes(2)
  })

  test('rejects an unknown route id and conflicting overrides', () => {
    const { routeTree } = createTree()

    expect(() => createTestRouteTree(routeTree, { '/missing': {} })).toThrow(
      'The route "/missing" does not exist in the route tree. Known route ids: __root__, /layout, /layout/posts/$postId, /lazy, /',
    )
    expect(() =>
      createTestRouteTree(routeTree, {
        '/layout': { loader: () => 'a', loaderData: 'b' },
      }),
    ).toThrow(
      'The override for route "/layout" has both "loader" and "loaderData". Pass one of them.',
    )
    expect(() =>
      createTestRouteTree(routeTree, {
        '/layout': { beforeLoad: () => ({}), routeContext: {} },
      }),
    ).toThrow(
      'The override for route "/layout" has both "beforeLoad" and "routeContext". Pass one of them.',
    )
    expect(() =>
      createTestRouteTree(routeTree, {
        '/layout': { context: () => ({}), routeContext: {} },
      }),
    ).toThrow(
      'The override for route "/layout" has both "context" and "routeContext". Pass one of them.',
    )
  })

  test('rejects a value for the context option', () => {
    const { routeTree } = createTree()

    expect(() =>
      createTestRouteTree(routeTree, {
        '/layout': { context: { scope: 'a value' } },
      }),
    ).toThrow(
      'The override for route "/layout" passes a value as "context", which replaces the route\'s `context` option and has to be a function. To seed what the route adds to the context, use "routeContext".',
    )
  })
})

describe('createIsolatedRouteTree', () => {
  test('keeps no option that does work or renders, and seeds the given loader data', async () => {
    const { routeTree, calls, loadLazyRoute } = createTree()

    const router = createRouter(
      createIsolatedRouteTree(routeTree, {
        routeId: '/layout/posts/$postId',
        component: 'element under test',
        loaderData: new Map([
          ['/layout/posts/$postId', 'seeded post data'],
          ['/layout', undefined],
        ]),
      }),
      '/posts/1?tab=comments',
    )
    await router.load()

    expect(calls).toEqual([])
    const match = getMatch(router, '/layout/posts/$postId')
    expect(match?.status).toBe('success')
    expect(match?.loaderData).toBe('seeded post data')
    // The router context is the whole context of every match.
    expect(match?.context).toEqual({ locale: 'en' })
    // The options derived from the URL still run.
    expect(match?.search).toEqual({ tab: 'comments' })
    expect(match?.params).toEqual({ postId: '1' })

    const routes = router.routesById as Record<string, AnyRoute>
    expect(routes['/layout/posts/$postId']!.options.component).toBe(
      'element under test',
    )
    expect(routes['/layout/posts/$postId']!.options.errorComponent).toBe(
      undefined,
    )
    expect(routes['/layout']!.options.component).toBe(undefined)
    expect(routes['__root__']!.options.component).toBe(undefined)
    expect((routes['__root__']!.options as any).shellComponent).toBe(undefined)

    await router.navigate({ to: '/lazy' })
    expect(router.state.location.pathname).toBe('/lazy')
    expect(loadLazyRoute).not.toHaveBeenCalled()
  })

  test('rejects an unknown route id', () => {
    const { routeTree } = createTree()

    expect(() =>
      createIsolatedRouteTree(routeTree, {
        routeId: '/missing',
        component: 'element under test',
        loaderData: new Map(),
      }),
    ).toThrow('The route "/missing" does not exist in the route tree')
  })
})

describe('helpers for a test router', () => {
  test('setTestRouterLocation moves a router that has not loaded yet', async () => {
    const { routeTree } = createTree()
    const router = createRouter(createTestRouteTree(routeTree), '/')

    setTestRouterLocation(router, {
      to: '/posts/$postId',
      params: { postId: '3' },
      search: { tab: 'comments' },
    })
    await router.load()

    expect(router.state.location.href).toBe('/posts/3?tab=comments')
    expect(getMatch(router, '/layout/posts/$postId')?.params).toEqual({
      postId: '3',
    })
  })

  test('assertRouteTestParams names the path params that are missing', () => {
    const { routeTree } = createTree()
    const router = createRouter(createTestRouteTree(routeTree), '/')

    expect(() =>
      assertRouteTestParams(router, '/layout/posts/$postId', undefined),
    ).toThrow('Missing path params for route "/layout/posts/$postId": postId.')
    expect(() =>
      assertRouteTestParams(router, '/layout/posts/$postId', { postId: '1' }),
    ).not.toThrow()
    expect(() =>
      assertRouteTestParams(router, '/lazy', undefined),
    ).not.toThrow()
  })

  test('assertIsolatedRouteLoaded passes for a matched route', async () => {
    const { routeTree } = createTree()
    const router = createRouter(
      createIsolatedRouteTree(routeTree, {
        routeId: '/layout/posts/$postId',
        component: 'element under test',
        loaderData: new Map(),
      }),
      '/posts/1',
    )
    await router.load()

    expect(() =>
      assertIsolatedRouteLoaded(router, '/layout/posts/$postId'),
    ).not.toThrow()
  })

  test('assertIsolatedRouteLoaded throws the error of a failed match', async () => {
    const { routeTree } = createTree()
    const router = createRouter(
      createIsolatedRouteTree(routeTree, {
        routeId: '/layout/posts/$postId',
        component: 'element under test',
        loaderData: new Map(),
      }),
      '/posts/1?tab=broken',
    )
    await router.load()

    expect(() =>
      assertIsolatedRouteLoaded(router, '/layout/posts/$postId'),
    ).toThrow('Unknown tab')
  })

  test('assertIsolatedRouteLoaded explains a route that is not matched', async () => {
    const { routeTree } = createTree()
    const router = createRouter(
      createIsolatedRouteTree(routeTree, {
        routeId: '/layout',
        component: 'element under test',
        loaderData: new Map(),
      }),
      '/',
    )
    await router.load()

    expect(() => assertIsolatedRouteLoaded(router, '/layout')).toThrow(
      'The route "/layout" is not matched at "/". Matched routes: __root__, /.',
    )
  })
})

describe('createTestRouterWith', () => {
  const createRouterCore = (options: any) => createTestRouter(options)

  test('creates the router with the given factory, over a copy of the tree', async () => {
    const { routeTree, rootRoute, calls } = createTree()
    const factory = vi.fn(createRouterCore)

    const router = createTestRouterWith(factory, {
      routeTree,
      context: { locale: 'en' },
      location: {
        to: '/posts/$postId',
        params: { postId: '3' },
        search: { tab: 'comments' },
      },
      overrides: { '/layout': { loaderData: 'seeded layout data' } },
      defaultPreloadStaleTime: 5,
    })
    await router.load()

    expect(factory).toHaveBeenCalledTimes(1)
    expect(router.routeTree).not.toBe(rootRoute)
    expect(router.options.defaultPreloadStaleTime).toBe(5)
    expect(router.state.location.href).toBe('/posts/3?tab=comments')
    expect(getMatch(router, '/layout')?.loaderData).toBe('seeded layout data')
    expect(calls).toContain('post.loader')
    expect(calls).not.toContain('layout.loader')
  })

  test('uses a memory history unless one is given', () => {
    const { routeTree } = createTree()

    const withMemoryHistory = createTestRouterWith(createRouterCore, {
      routeTree,
      context: { locale: 'en' },
      location: { to: '/lazy' },
    })
    expect(withMemoryHistory.history.location.pathname).toBe('/lazy')
    expect(window.location.pathname).toBe('/')

    const history = createMemoryHistory({ initialEntries: ['/posts/1'] })
    const withHistory = createTestRouterWith(createRouterCore, {
      routeTree,
      history,
      context: { locale: 'en' },
    })
    expect(withHistory.history).toBe(history)
    expect(withHistory.history.location.pathname).toBe('/posts/1')
  })
})

describe('createIsolatedTestRouterWith', () => {
  const createRouterCore = (options: any) => createTestRouter(options)

  test('resolves to a loaded router that renders the component in the route', async () => {
    const { routeTree, calls } = createTree()

    const router = await createIsolatedTestRouterWith(createRouterCore, {
      routeTree,
      route: '/layout/posts/$postId',
      component: 'element under test',
      params: { postId: '4' },
      search: { tab: 'comments' },
      context: { locale: 'en', session: 'seeded session' },
      loaderData: {
        '/layout': 'seeded layout data',
        '/layout/posts/$postId': 'seeded post data',
      },
      defaultComponent: 'default component',
      defaultNotFoundComponent: 'default not-found component',
    })

    expect(calls).toEqual([])
    expect(router.state.status).toBe('idle')
    expect(router.state.location.href).toBe('/posts/4?tab=comments')
    const match = getMatch(router, '/layout/posts/$postId')
    expect(match?.status).toBe('success')
    expect(match?.loaderData).toBe('seeded post data')
    expect(match?.context).toEqual({ locale: 'en', session: 'seeded session' })
    expect(getMatch(router, '/layout')?.loaderData).toBe('seeded layout data')

    const routes = router.routesById as Record<string, AnyRoute>
    expect(routes['/layout/posts/$postId']!.options.component).toBe(
      'element under test',
    )
    // Framework options, so core types do not know them.
    const options = router.options as Record<string, unknown>
    expect(options.defaultComponent).toBeUndefined()
    expect(options.defaultNotFoundComponent).toBeUndefined()
    expect(router.options.disableGlobalCatchBoundary).toBe(true)
  })

  test('rejects when the route cannot be reached as asked', async () => {
    const { routeTree } = createTree()
    const base = { routeTree, component: 'element under test' }

    await expect(
      createIsolatedTestRouterWith(createRouterCore, {
        ...base,
        route: '/missing',
      }),
    ).rejects.toThrow('The route "/missing" does not exist in the route tree')
    await expect(
      createIsolatedTestRouterWith(createRouterCore, {
        ...base,
        route: '/layout/posts/$postId',
      }),
    ).rejects.toThrow(
      'Missing path params for route "/layout/posts/$postId": postId.',
    )
    await expect(
      createIsolatedTestRouterWith(createRouterCore, {
        ...base,
        route: '/layout/posts/$postId',
        params: { postId: '1' },
        search: { tab: 'broken' },
      }),
    ).rejects.toThrow('Unknown tab')
    await expect(
      createIsolatedTestRouterWith(createRouterCore, {
        ...base,
        route: '/layout/posts/$postId',
        params: { postId: 'missing' },
      }),
    ).rejects.toThrow(
      'The route "/layout/posts/$postId" threw notFound() while parsing its path params at "/posts/missing".',
    )
    await expect(
      createIsolatedTestRouterWith(createRouterCore, {
        ...base,
        route: '/layout/posts/$postId',
        params: { postId: '1' },
        search: { tab: 'missing' },
      }),
    ).rejects.toThrow(
      'The route "/layout/posts/$postId" threw notFound() while validating its search params at "/posts/1?tab=missing".',
    )
    await expect(
      createIsolatedTestRouterWith(createRouterCore, {
        ...base,
        route: '/layout',
      }),
    ).rejects.toThrow('The route "/layout" is not matched at "/"')
  })
})
