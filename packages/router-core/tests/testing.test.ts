import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import {
  assertIsolatedRouteLoaded,
  assertRouteTestParams,
  createIsolatedRouteTree,
  createTestRouteTree,
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
    validateSearch: (search: Record<string, unknown>) => {
      if (search.tab === 'broken') {
        throw new Error('Unknown tab')
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

  test('leaves a tree alone that a router has already processed', () => {
    const { routeTree, postRoute } = createTree()
    createRouter(routeTree, '/')
    const originalIndex = postRoute.originalIndex
    const init = vi.spyOn(postRoute, 'init')

    initRouteTree(routeTree)

    expect(init).not.toHaveBeenCalled()
    expect(postRoute.originalIndex).toBe(originalIndex)
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

  test('treats a context value as a seed for everything the route contributes', async () => {
    const { routeTree, calls } = createTree()

    const router = createRouter(
      createTestRouteTree(routeTree, {
        '/layout/posts/$postId': { context: { scope: 'seeded scope' } },
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

  test('lets a later override map win, option by option', async () => {
    const { routeTree } = createTree()

    const router = createRouter(
      createTestRouteTree(
        routeTree,
        {
          '/layout': { loaderData: 'default layout data' },
          '/layout/posts/$postId': {
            loader: () => 'default post data',
            component: 'default component',
          },
        },
        undefined,
        {
          '/layout/posts/$postId': { loaderData: 'test post data' },
        },
      ),
      '/posts/1',
    )
    await router.load()

    expect(getMatch(router, '/layout')?.loaderData).toBe('default layout data')
    expect(getMatch(router, '/layout/posts/$postId')?.loaderData).toBe(
      'test post data',
    )
    expect(router.routesById['/layout/posts/$postId']!.options.component).toBe(
      'default component',
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

  test('rejects an unknown route id and an ambiguous loader override', () => {
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
