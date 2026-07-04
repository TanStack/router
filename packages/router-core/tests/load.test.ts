import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  PathParamError,
  SearchParamError,
  createControlledPromise,
  notFound,
  redirect,
  rootRouteId,
} from '../src'
import { createTestRouter } from './routerTestUtils'
import {
  loadClientMatches,
  startBackgroundLoad,
} from '../src/load-matches.client'
import { projectClientRouteAssets } from '../src/route-assets.client'
import { projectServerRouteAssets } from '../src/route-assets.server'
import { loadServerMatches } from '../src/load-matches.server'
import { settleMatchLoad } from '../src/load-matches'
import { loadRouteChunk } from '../src/route-chunks'
import { isRedirect } from '../src/redirect'
import type { LoadMatchesArg } from '../src/load-matches'
import type {
  AnyRouteMatch,
  AnyRouter,
  ControlledPromise,
  LoaderStaleReloadMode,
  RootRouteOptions,
  RouterCore,
  LocationRewrite,
} from '../src'

type AnyRouteOptions = RootRouteOptions<any>
type BeforeLoad = NonNullable<AnyRouteOptions['beforeLoad']>
type Loader = NonNullable<AnyRouteOptions['loader']>
type LoaderEntry = Exclude<Loader, Function>
type LoaderFn = Exclude<Loader, LoaderEntry>

const settleClientLane = (matches: Array<AnyRouteMatch>) => {
  for (const match of matches) {
    settleMatchLoad(match)
  }
}

const loadClientMatchesArg = (arg: LoadMatchesArg) => {
  const loadContext = {
    router: arg.router,
    location: arg.location,
    matches: arg.matches,
    preload: arg.preload,
    forceStaleReload: arg.forceReload,
    background: arg.background,
    onReady: arg.onReady,
  }

  return loadClientMatches(loadContext).catch((error) => {
    if (error === loadContext) {
      return arg.matches
    }
    throw error
  })
}

const loadMatches = async (arg: LoadMatchesArg) => {
  if (arg.router.isServer) {
    return loadServerMatches(arg)
  }

  try {
    const matches = await loadClientMatchesArg(arg)
    settleClientLane(matches)
    return matches
  } catch (error) {
    if (!isRedirect(error)) {
      settleClientLane(arg.matches)
    }
    throw error
  }
}

const projectAssets = async ({
  router,
  matches,
  preload,
  isCurrent = () => true,
}: {
  router: AnyRouter
  matches: Array<AnyRouteMatch>
  preload?: boolean
  isCurrent?: () => boolean
}) => {
  const assets = projectClientRouteAssets(router, matches, preload, isCurrent)
  if (assets) {
    await assets
  }
}

const gateFinalCommit = (router: AnyRouter) => {
  const gate = createControlledPromise<void>()
  const started = vi.fn()
  const original = router.startViewTransition

  router.startViewTransition = ((fn: any) => {
    started()
    return gate.then(() => fn())
  }) as AnyRouter['startViewTransition']

  return {
    gate,
    started,
    restore: () => {
      router.startViewTransition = original
    },
  }
}

function expectNoCachedActiveOverlap(router: AnyRouter) {
  const ownedIds = new Set([
    ...router.state.matches.map((match) => match.id),
    ...router.stores.pendingMatches.get().map((match) => match.id),
  ])
  const overlappingCachedIds = router.stores.cachedMatches
    .get()
    .flatMap((match) => (ownedIds.has(match.id) ? [match.id] : []))

  expect(overlappingCachedIds).toEqual([])
}

const getLaneMatch = (matches: Array<AnyRouteMatch>, id: string) =>
  matches.find((match) => match.id === id)

describe('router server flags', () => {
  test('uses false fallbacks on client routers', () => {
    const rootRoute = new BaseRootRoute({})
    const router = createTestRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: false,
      isShell: true,
      isPrerendering: true,
    })

    expect(router.isShell()).toBe(false)
    expect(router.isPrerendering()).toBe(false)
  })

  test('reads shell and prerendering options on server routers', () => {
    const rootRoute = new BaseRootRoute({})
    const router = createTestRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
      isShell: true,
      isPrerendering: true,
    })

    expect(router.isShell()).toBe(true)
    expect(router.isPrerendering()).toBe(true)
  })
})

describe('redirect resolution', () => {
  test('resolveRedirect normalizes same-origin Location to path-only on the server', async () => {
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
    })

    const routeTree = rootRoute.addChildren([fooRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['https://example.com/foo'],
      }),
      origin: 'https://example.com',
      isServer: true,
    })

    // This redirect already includes an absolute Location header (external-ish),
    // but still represents an internal navigation.
    const unresolved = redirect({
      to: '/foo',
      headers: { Location: 'https://example.com/foo' },
    })

    const resolved = router.resolveRedirect(unresolved)

    // Expect Location and stored href to be path-only (no origin).
    expect(resolved.headers.get('Location')).toBe('/foo')
    expect(resolved.options.href).toBe('/foo')
  })

  test('resolveRedirect does not rewrite Location on the client', async () => {
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
    })

    const routeTree = rootRoute.addChildren([fooRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['https://example.com/foo'],
      }),
      origin: 'https://example.com',
      isServer: false,
    })

    const unresolved = redirect({
      to: '/foo',
      headers: { Location: 'https://example.com/foo' },
    })

    const resolved = router.resolveRedirect(unresolved)

    expect(resolved.headers.get('Location')).toBe('https://example.com/foo')
    expect(resolved.options.href).toBe('/foo')
  })

  test('resolveRedirect does not add Location on the client', async () => {
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
    })

    const routeTree = rootRoute.addChildren([fooRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/foo'] }),
      isServer: false,
    })

    const unresolved = redirect({ to: '/foo' })
    const resolved = router.resolveRedirect(unresolved)

    expect(resolved.headers.get('Location')).toBe(null)
    expect(resolved.options.href).toBe('/foo')
  })

  test.each(['/$a', '/$toString', '/$__proto__'])(
    'server startup redirects initial path %s to /undefined',
    async (initialPath) => {
      const rootRoute = new BaseRootRoute({})
      const slugRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/$slug',
      })

      const routeTree = rootRoute.addChildren([slugRoute])

      const router = createTestRouter({
        routeTree,
        history: createMemoryHistory({ initialEntries: [initialPath] }),
        isServer: true,
      })

      await router.load()

      expect(router.redirect).toEqual(
        expect.objectContaining({
          options: expect.objectContaining({ href: '/undefined' }),
        }),
      )
      expect(router.redirect?.headers.get('Location')).toBe('/undefined')
    },
  )
})

describe('server router.load status codes', () => {
  test('keeps successful server loads at status 200', async () => {
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => 'home',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })

    await router.load()

    expect(router.statusCode).toBe(200)
    expect(router.redirect).toBeUndefined()
    expect(router.state.matches.at(-1)?.loaderData).toBe('home')
  })

  test('uses redirect status and instance redirect for server redirects', async () => {
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const fromRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/from',
      beforeLoad: () => {
        throw redirect({ to: '/target', statusCode: 307 })
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fromRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/from'] }),
      isServer: true,
    })

    await router.load()

    expect(router.statusCode).toBe(307)
    expect(router.redirect?.status).toBe(307)
    expect(router.redirect?.options.href).toBe('/target')
    expect(router.redirect?.headers.get('Location')).toBe('/target')
  })

  test.each([
    [
      'loader returns notFound',
      '/loader-return-not-found',
      () => ({
        loader: () => notFound(),
      }),
    ],
    [
      'loader throws notFound',
      '/loader-throw-not-found',
      () => ({
        loader: () => {
          throw notFound()
        },
      }),
    ],
    [
      'beforeLoad returns notFound',
      '/before-return-not-found',
      () => ({
        beforeLoad: () => notFound(),
      }),
    ],
    [
      'beforeLoad throws notFound',
      '/before-throw-not-found',
      () => ({
        beforeLoad: () => {
          throw notFound()
        },
      }),
    ],
  ] as const)('sets 404 when a server %s', async (_name, path, getOptions) => {
    const rootRoute = new BaseRootRoute({})
    const missingRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path,
      ...getOptions(),
      notFoundComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([missingRoute]),
      history: createMemoryHistory({ initialEntries: [path] }),
      isServer: true,
    })

    await router.load()

    const match = router.state.matches.find(
      (item) => item.routeId === missingRoute.id,
    )
    expect(router.statusCode).toBe(404)
    expect(router.redirect).toBeUndefined()
    expect(match?.status).toBe('notFound')
    expect(match?.error).toEqual(expect.objectContaining({ isNotFound: true }))
  })

  test('sets 404 for unmatched server routes with a root notFound boundary', async () => {
    const rootRoute = new BaseRootRoute({
      notFoundComponent: () => null,
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/missing'] }),
      isServer: true,
    })

    await router.load()

    const rootMatch = router.state.matches.find(
      (item) => item.routeId === rootRoute.id,
    )
    expect(router.statusCode).toBe(404)
    expect(router.redirect).toBeUndefined()
    expect(rootMatch?.globalNotFound).toBe(true)
  })

  test('sets 500 when a server loader throws', async () => {
    const loaderError = new Error('loader failed')
    const rootRoute = new BaseRootRoute({})
    const errorRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/error',
      loader: () => {
        throw loaderError
      },
      errorComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([errorRoute]),
      history: createMemoryHistory({ initialEntries: ['/error'] }),
      isServer: true,
    })

    await router.load()

    const match = router.state.matches.find(
      (item) => item.routeId === errorRoute.id,
    )
    expect(router.statusCode).toBe(500)
    expect(router.redirect).toBeUndefined()
    expect(match?.status).toBe('error')
    expect(match?.error).toBe(loaderError)
  })

  test('sets 500 when a server beforeLoad throws', async () => {
    const beforeLoadError = new Error('beforeLoad failed')
    const rootRoute = new BaseRootRoute({})
    const errorRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/before-error',
      beforeLoad: () => {
        throw beforeLoadError
      },
      errorComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([errorRoute]),
      history: createMemoryHistory({ initialEntries: ['/before-error'] }),
      isServer: true,
    })

    await router.load()

    const match = router.state.matches.find(
      (item) => item.routeId === errorRoute.id,
    )
    expect(router.statusCode).toBe(500)
    expect(router.redirect).toBeUndefined()
    expect(match?.status).toBe('error')
    expect(match?.error).toBe(beforeLoadError)
  })
})

describe('direct client/server match loading', () => {
  const setupDirectLoad = ({
    isServer,
    routeTree,
    path,
  }: {
    isServer: boolean
    routeTree: any
    path: string
  }) => {
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [path] }),
      isServer,
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)
    return { router, location, matches }
  }

  test.each([
    ['client', false, loadClientMatchesArg],
    ['server', true, loadServerMatches],
  ] as const)(
    'loads beforeLoad context into loaders on the %s path',
    async (label, isServer, loadImpl) => {
      const token = `${label}-token`
      const parentBeforeLoad = vi.fn(() => ({ token }))
      const childLoader = vi.fn(({ context, preload }) => ({
        token: (context as { token: string }).token,
        preload,
      }))
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        beforeLoad: parentBeforeLoad,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: childLoader,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer,
      })
      const location = router.latestLocation
      const matches = router.matchRoutes(location)
      router.stores.setPending(matches)

      const loadedMatches = await loadImpl({ router, location, matches })

      const parentMatch = loadedMatches.find(
        (item) => item.routeId === parentRoute.id,
      )
      const childMatch = loadedMatches.find(
        (item) => item.routeId === childRoute.id,
      )
      expect(parentBeforeLoad).toHaveBeenCalledTimes(1)
      expect(childLoader).toHaveBeenCalledTimes(1)
      expect(parentMatch?.context).toMatchObject({ token })
      expect(childMatch?.status).toBe('success')
      expect(childMatch?.loaderData).toEqual({ token, preload: false })
    },
  )

  test('server beforeLoad and loader reuse the route-matched abortController', async () => {
    let beforeLoadController: AbortController | undefined
    let loaderController: AbortController | undefined
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad: ({ abortController }) => {
        beforeLoadController = abortController
      },
      loader: ({ abortController }) => {
        loaderController = abortController
      },
    })
    const { router, location, matches } = setupDirectLoad({
      isServer: true,
      routeTree: rootRoute.addChildren([fooRoute]),
      path: '/foo',
    })
    const matchedController = matches[1]!.abortController

    await loadServerMatches({ router, location, matches })

    expect(beforeLoadController).toBe(matchedController)
    expect(loaderController).toBe(matchedController)
    expect(matches[1]!.abortController).toBe(matchedController)
  })

  test.each([
    ['client', false, loadClientMatchesArg],
    ['server', true, loadServerMatches],
  ] as const)(
    'commits an ancestor notFound boundary and trims descendants on the %s path',
    async (_label, isServer, loadImpl) => {
      const rootRoute = new BaseRootRoute({
        notFoundComponent: () => null,
      })
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        notFoundComponent: () => null,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        beforeLoad: () => {
          throw notFound({ routeId: parentRoute.id })
        },
      })
      const { router, location, matches } = setupDirectLoad({
        isServer,
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        path: '/parent/child',
      })
      const childMatch = matches[2]!

      await expect(loadImpl({ router, location, matches })).rejects.toEqual(
        expect.objectContaining({ isNotFound: true }),
      )

      expect(matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        parentRoute.id,
      ])
      expect(matches[1]).toEqual(
        expect.objectContaining({
          routeId: parentRoute.id,
          status: 'notFound',
          error: expect.objectContaining({ isNotFound: true }),
        }),
      )
      expect(childMatch._.loadPromise?.status).not.toBe('pending')
    },
  )

  test.each([
    ['client', false, loadClientMatchesArg],
    ['server', true, loadServerMatches],
  ] as const)(
    'throws redirects from beforeLoad on the %s path without running descendant loaders',
    async (_label, isServer, loadImpl) => {
      const childLoader = vi.fn()
      const rootRoute = new BaseRootRoute({})
      const protectedRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/protected',
        beforeLoad: () => {
          throw redirect({ to: '/login', statusCode: 302 })
        },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => protectedRoute,
        path: '/child',
        loader: childLoader,
      })
      const loginRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/login',
      })
      const { router, location, matches } = setupDirectLoad({
        isServer,
        routeTree: rootRoute.addChildren([
          protectedRoute.addChildren([childRoute]),
          loginRoute,
        ]),
        path: '/protected/child',
      })

      await expect(loadImpl({ router, location, matches })).rejects.toEqual(
        expect.objectContaining({
          options: expect.objectContaining({ href: '/login' }),
        }),
      )
      expect(childLoader).not.toHaveBeenCalled()
    },
  )

  test.each([
    ['client', false, loadClientMatchesArg],
    ['server', true, loadServerMatches],
  ] as const)(
    'commits loader errors to the matching route on the %s path',
    async (_label, isServer, loadImpl) => {
      const thrown = new Error('direct loader failed')
      const rootRoute = new BaseRootRoute({})
      const errorRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/error',
        loader: () => {
          throw thrown
        },
        errorComponent: () => null,
      })
      const { router, location, matches } = setupDirectLoad({
        isServer,
        routeTree: rootRoute.addChildren([errorRoute]),
        path: '/error',
      })

      if (isServer) {
        await expect(loadImpl({ router, location, matches })).rejects.toBe(
          thrown,
        )
      } else {
        await expect(loadImpl({ router, location, matches })).resolves.toBe(
          matches,
        )
      }

      expect(matches.at(-1)).toEqual(
        expect.objectContaining({
          routeId: errorRoute.id,
          status: 'error',
          error: thrown,
        }),
      )
    },
  )
})

describe('notFound detection', () => {
  test('does not treat arbitrary proxy property access as notFound', async () => {
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader: () =>
        new Proxy(
          {},
          {
            get(_target, prop) {
              if (prop === 'isNotFound') return 'truthy-but-not-true'
              return undefined
            },
            has() {
              return true
            },
          },
        ),
    })

    const routeTree = rootRoute.addChildren([fooRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/foo'] }),
      isServer: true,
    })

    await router.load()

    expect(router.state.matches.at(-1)?.status).toBe('success')
    expect(router.state.matches.at(-1)?.error).toBeUndefined()
  })
})

describe('beforeLoad skip or exec', () => {
  const setup = ({ beforeLoad }: { beforeLoad?: BeforeLoad }) => {
    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad,
    })

    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })

    const routeTree = rootRoute.addChildren([fooRoute, barRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    return router
  }

  test('baseline', async () => {
    const beforeLoad = vi.fn()
    const router = setup({ beforeLoad })
    await router.load()
    expect(beforeLoad).toHaveBeenCalledTimes(0)
  })

  test('exec on regular nav', async () => {
    const beforeLoad = vi.fn(() => Promise.resolve({ hello: 'world' }))
    const router = setup({ beforeLoad })
    const navigation = router.navigate({ to: '/foo' })
    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(router.stores.pendingMatches.get()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: '/foo/foo' })]),
    )
    await navigation
    expect(router.state.location.pathname).toBe('/foo')
    expect(router.state.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '/foo/foo',
          context: {
            hello: 'world',
          },
        }),
      ]),
    )
    expect(beforeLoad).toHaveBeenCalledTimes(1)
  })

  test('sync beforeLoad starts descendant loaders in the same turn', async () => {
    const parentBeforeLoad = vi.fn(() => ({ token: 'sync' }))
    const childLoader = vi.fn<LoaderFn>(({ context }) => context)

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad: parentBeforeLoad,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: childLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)

    const loadPromise = loadMatches({ router, location, matches })

    expect(parentBeforeLoad).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveReturnedWith(
      expect.objectContaining({
        token: 'sync',
      }),
    )

    await loadPromise
  })

  test('async beforeLoad delays descendant loaders until it settles', async () => {
    const beforeLoadGate = createControlledPromise<{ token: string }>()
    const parentBeforeLoad = vi.fn(() => beforeLoadGate)
    const childLoader = vi.fn<LoaderFn>(({ context }) => context)

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad: parentBeforeLoad,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: childLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)

    const loadPromise = loadMatches({ router, location, matches })

    expect(parentBeforeLoad).toHaveBeenCalledTimes(1)
    expect(childLoader).not.toHaveBeenCalled()

    beforeLoadGate.resolve({ token: 'async' })
    await Promise.resolve()
    await Promise.resolve()

    expect(childLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveReturnedWith(
      expect.objectContaining({
        token: 'async',
      }),
    )

    await loadPromise
  })

  test('preserves primitive errors thrown from beforeLoad', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(() => {
      throw 'primitive error'
    })
    const router = setup({ beforeLoad })

    await router.navigate({ to: '/foo' })

    expect(router.state.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '/foo/foo',
          status: 'error',
          error: 'primitive error',
        }),
      ]),
    )
  })

  test('does not mutate object errors thrown from beforeLoad', async () => {
    const thrown = { type: 'domain-error' }
    const beforeLoad = vi.fn<BeforeLoad>(() => {
      throw thrown
    })
    const router = setup({ beforeLoad })

    await router.navigate({ to: '/foo' })

    expect(router.state.matches.find((d) => d.id === '/foo/foo')?.error).toBe(
      thrown,
    )
    expect(thrown).toEqual({ type: 'domain-error' })
  })

  test.each([false, true])(
    'handles %s async returned redirects from beforeLoad',
    async (asyncReturn) => {
      const beforeLoad = vi.fn<BeforeLoad>(() => {
        const result = redirect({ to: '/bar' })
        return asyncReturn ? Promise.resolve(result) : result
      })
      const router = setup({ beforeLoad })

      await router.navigate({ to: '/foo' })

      expect(router.state.location.pathname).toBe('/bar')
      expect(beforeLoad).toHaveBeenCalledTimes(1)
    },
  )

  test('client beforeLoad redirect stays current during basepath navigation', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(() => {
      throw redirect({ to: '/about' })
    })
    const rootRoute = new BaseRootRoute({})
    const redirectRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/redirect',
      beforeLoad,
    })
    const aboutRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([redirectRoute, aboutRoute]),
      history: createMemoryHistory({ initialEntries: ['/app/'] }),
      basepath: '/app',
      isServer: false,
    })

    await router.load()
    await router.navigate({ to: '/redirect' })

    await vi.waitFor(() =>
      expect(router.state.location.publicHref).toBe('/app/about'),
    )
    expect(beforeLoad).toHaveBeenCalledTimes(1)
  })

  test('client beforeLoad redirect stays current during rewritten navigation', async () => {
    const rewrite = {
      input: ({ url }) => {
        if (url.pathname.startsWith('/en/')) {
          url.pathname = url.pathname.slice(3)
        }
        return url
      },
      output: ({ url }) => {
        url.pathname = `/en${url.pathname}`
        return url
      },
    } satisfies LocationRewrite
    const beforeLoad = vi.fn<BeforeLoad>(() => {
      throw redirect({ to: '/about' })
    })
    const rootRoute = new BaseRootRoute({})
    const redirectRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/redirect',
      beforeLoad,
    })
    const aboutRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([redirectRoute, aboutRoute]),
      history: createMemoryHistory({ initialEntries: ['/en/'] }),
      rewrite,
      isServer: false,
    })

    await router.load()
    await router.navigate({ to: '/redirect' })

    await vi.waitFor(() =>
      expect(router.state.location.publicHref).toBe('/en/about'),
    )
    expect(beforeLoad).toHaveBeenCalledTimes(1)
  })

  test.each([false, true])(
    'handles %s async returned notFounds from beforeLoad',
    async (asyncReturn) => {
      const loader = vi.fn()
      const rootRoute = new BaseRootRoute({})
      const fooRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/foo',
        beforeLoad: () => {
          const result = notFound()
          return asyncReturn ? Promise.resolve(result) : result
        },
        loader,
        notFoundComponent: () => null,
      })

      const routeTree = rootRoute.addChildren([fooRoute])
      const router = createTestRouter({
        routeTree,
        history: createMemoryHistory(),
      })

      await router.navigate({ to: '/foo' })

      const match = router.state.matches.find((m) => m.routeId === fooRoute.id)
      expect(match?.status).toBe('notFound')
      expect(loader).not.toHaveBeenCalled()
    },
  )

  test.each([false, true])(
    'exec if %s async returned preload redirect from beforeLoad',
    async (asyncReturn) => {
      const beforeLoad = vi.fn<BeforeLoad>(({ preload }) => {
        if (preload) {
          const result = redirect({ to: '/bar' })
          return asyncReturn ? Promise.resolve(result) : result
        }
        return undefined
      })
      const router = setup({ beforeLoad })

      await router.preloadRoute({ to: '/foo' })
      expect(
        router.stores.cachedMatches.get().some((d) => d.id === '/foo/foo'),
      ).toBe(false)

      await router.navigate({ to: '/foo' })

      expect(router.state.location.pathname).toBe('/foo')
      expect(beforeLoad).toHaveBeenCalledTimes(2)
    },
  )

  test.each([false, true])(
    'exec if %s async returned preload notFound from beforeLoad',
    async (asyncReturn) => {
      const beforeLoad = vi.fn<BeforeLoad>(({ preload }) => {
        if (preload) {
          const result = notFound()
          return asyncReturn ? Promise.resolve(result) : result
        }
        return undefined
      })
      const router = setup({ beforeLoad })

      await router.preloadRoute({ to: '/foo' })
      expect(
        router.stores.cachedMatches.get().some((d) => d.id === '/foo/foo'),
      ).toBe(false)
      await router.navigate({ to: '/foo' })

      expect(router.state.location.pathname).toBe('/foo')
      expect(beforeLoad).toHaveBeenCalledTimes(2)
    },
  )

  test('exec if resolved preload (success)', async () => {
    const beforeLoad = vi.fn()
    const router = setup({ beforeLoad })
    await router.preloadRoute({ to: '/foo' })
    expect(router.stores.cachedMatches.get()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: '/foo/foo' })]),
    )
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if pending preload (success)', async () => {
    const beforeLoad = vi.fn(() => sleep(100))
    const router = setup({ beforeLoad })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    expect(router.stores.cachedMatches.get()).toEqual([])
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if rejected preload (notFound)', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      if (preload) throw notFound()
      await Promise.resolve()
    })
    const router = setup({
      beforeLoad,
    })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if pending preload (notFound)', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      await sleep(100)
      if (preload) throw notFound()
    })
    const router = setup({
      beforeLoad,
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if rejected preload (redirect)', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      if (preload) throw redirect({ to: '/bar' })
      await Promise.resolve()
    })
    const router = setup({
      beforeLoad,
    })
    await router.preloadRoute({ to: '/foo' })
    expect(
      router.stores.cachedMatches.get().some((d) => d.id === '/foo/foo'),
    ).toBe(false)
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/foo')
    expect(
      router.stores.cachedMatches.get().some((d) => d.id === '/foo/foo'),
    ).toBe(false)
    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if pending preload (redirect)', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      await sleep(100)
      if (preload) throw redirect({ to: '/bar' })
    })
    const router = setup({
      beforeLoad,
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/foo')
    expect(
      router.stores.cachedMatches.get().some((d) => d.id === '/foo/foo'),
    ).toBe(false)
    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('exec if rejected preload (error)', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      if (preload) throw new Error('error')
      await Promise.resolve()
    })
    const router = setup({
      beforeLoad,
    })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })

  test('skip child beforeLoad when parent beforeLoad throws during preload', async () => {
    const parentBeforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      if (preload) throw new Error('parent error')
    })
    const childBeforeLoad = vi.fn<BeforeLoad>()
    const parentHead = vi.fn(() => ({ meta: [{ title: 'Parent' }] }))
    const childHead = vi.fn(() => ({ meta: [{ title: 'Child' }] }))

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad: parentBeforeLoad,
      head: parentHead,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      beforeLoad: childBeforeLoad,
      head: childHead,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory(),
    })

    await router.preloadRoute({ to: '/parent/child' })

    expect(parentBeforeLoad).toHaveBeenCalledTimes(1)
    expect(childBeforeLoad).not.toHaveBeenCalled()
    expect(parentHead).not.toHaveBeenCalled()
    expect(childHead).not.toHaveBeenCalled()
  })

  test('preload descendant waits for active parent beforeLoad context', async () => {
    const parentBeforeLoadPromise = createControlledPromise<{ auth: string }>()
    const parentBeforeLoad = vi.fn<BeforeLoad>(() => parentBeforeLoadPromise)
    const childLoader = vi.fn<LoaderFn>(({ context }) => context)

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad: parentBeforeLoad,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: childLoader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory(),
    })

    const navigation = router.navigate({ to: '/parent' })
    await Promise.resolve()
    expect(parentBeforeLoad).toHaveBeenCalledTimes(1)

    const preload = router.preloadRoute({ to: '/parent/child' })
    await Promise.resolve()
    expect(childLoader).not.toHaveBeenCalled()

    parentBeforeLoadPromise.resolve({ auth: 'ok' })
    await navigation
    await preload

    expect(childLoader).toHaveBeenCalledTimes(1)
    expect(childLoader.mock.calls[0]?.[0].context).toMatchObject({
      auth: 'ok',
    })
  })

  test('joined preload waits for borrowed parent success while a sibling is still loading', async () => {
    const siblingLoaderPromise = createControlledPromise<void>()
    const parentLoader = vi.fn<LoaderFn>(() => ({ auth: 'ok' }))
    const siblingLoader = vi.fn<LoaderFn>(() => siblingLoaderPromise)
    const childLoader = vi.fn<LoaderFn>(() => ({ child: 'preloaded' }))

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: parentLoader,
    })
    const siblingRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/sibling',
      loader: siblingLoader,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: childLoader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        parentRoute.addChildren([siblingRoute, childRoute]),
      ]),
      history: createMemoryHistory(),
    })

    await router.load()

    const navigation = router.navigate({ to: '/parent/sibling' })
    await vi.waitFor(() => expect(siblingLoader).toHaveBeenCalledTimes(1))

    const preloadSettled = vi.fn()
    const preload = router.preloadRoute({ to: '/parent/child' })
    preload.then(preloadSettled)
    await Promise.resolve()

    expect(childLoader).not.toHaveBeenCalled()
    expect(preloadSettled).not.toHaveBeenCalled()

    siblingLoaderPromise.resolve()
    await Promise.all([navigation, preload])

    expect(childLoader).toHaveBeenCalledTimes(1)
    expect(preloadSettled).toHaveBeenCalledTimes(1)
  })

  test('joined preload waits for borrowed terminal error to commit', async () => {
    const parentError = new Error('parent failed')
    const parentLoader = vi.fn<LoaderFn>(() => {
      throw parentError
    })
    const childLoader = vi.fn<LoaderFn>(() => ({ child: 'preloaded' }))

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: parentLoader,
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: childLoader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory(),
    })
    const finalCommit = gateFinalCommit(router)

    try {
      const navigation = router.navigate({ to: '/parent' })
      await vi.waitFor(() => expect(finalCommit.started).toHaveBeenCalled())

      const preloadSettled = vi.fn()
      const preload = router.preloadRoute({ to: '/parent/child' })
      preload.then(preloadSettled)
      await Promise.resolve()

      expect(preloadSettled).not.toHaveBeenCalled()
      expect(childLoader).not.toHaveBeenCalled()

      finalCommit.gate.resolve()
      const [, preloadResult] = await Promise.all([navigation, preload])

      expect(preloadSettled).toHaveBeenCalledTimes(1)
      expect(preloadResult).toBeUndefined()
      expect(childLoader).not.toHaveBeenCalled()
    } finally {
      finalCommit.restore()
    }
  })

  test('preload canceled by borrowed redirect projects no assets and caches nothing', async () => {
    vi.useFakeTimers()

    try {
      let rejectParent!: (error: unknown) => void
      const parentLoader = vi.fn<LoaderFn>(
        () =>
          new Promise((_resolve, reject) => {
            rejectParent = reject
          }),
      )
      const childLoader = vi.fn<LoaderFn>(() => ({ child: 'preloaded' }))
      const childHead = vi.fn(() => ({}))
      const targetLoader = vi.fn<LoaderFn>(() => ({ target: true }))

      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: parentLoader,
        pendingMs: 1,
        pendingComponent: {},
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: childLoader,
        head: childHead,
      })
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
        loader: targetLoader,
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          indexRoute,
          parentRoute.addChildren([childRoute]),
          targetRoute,
        ]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await router.load()

      const navigation = router.navigate({ to: '/parent' })
      await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(1))

      await vi.advanceTimersByTimeAsync(1)
      await vi.waitFor(() =>
        expect(
          router.state.matches.some(
            (match) =>
              match.routeId === parentRoute.id && match.status === 'pending',
          ),
        ).toBe(true),
      )

      const preload = router.preloadRoute({ to: '/parent/child' })
      await Promise.resolve()

      expect(childLoader).not.toHaveBeenCalled()
      expect(childHead).not.toHaveBeenCalled()

      rejectParent(redirect({ to: '/target' }))
      const [, preloadResult] = await Promise.all([navigation, preload])

      expect(router.state.location.pathname).toBe('/target')
      expect(preloadResult).toBeUndefined()
      expect(childLoader).not.toHaveBeenCalled()
      expect(childHead).not.toHaveBeenCalled()
      expect(targetLoader).toHaveBeenCalledTimes(1)
      expect(
        router.stores.cachedMatches
          .get()
          .some((match) => match.routeId === childRoute.id),
      ).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  test('joined preload waits for borrowed notFound to commit', async () => {
    const parentLoader = vi.fn<LoaderFn>(() => notFound())
    const childLoader = vi.fn<LoaderFn>(() => ({ child: 'preloaded' }))

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: parentLoader,
      notFoundComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: childLoader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory(),
    })
    const finalCommit = gateFinalCommit(router)

    try {
      const navigation = router.navigate({ to: '/parent' })
      await vi.waitFor(() => expect(finalCommit.started).toHaveBeenCalled())

      const preloadSettled = vi.fn()
      const preload = router.preloadRoute({ to: '/parent/child' })
      preload.then(preloadSettled)
      await Promise.resolve()

      expect(preloadSettled).not.toHaveBeenCalled()
      expect(childLoader).not.toHaveBeenCalled()

      finalCommit.gate.resolve()
      const [, preloadResult] = await Promise.all([navigation, preload])

      expect(preloadSettled).toHaveBeenCalledTimes(1)
      expect(preloadResult).toBeUndefined()
      expect(childLoader).not.toHaveBeenCalled()
    } finally {
      finalCommit.restore()
    }
  })

  test('preload canceled by borrowed notFound does not load the borrowed boundary component', async () => {
    const notFoundPreload = vi.fn()
    const parentLoader = vi.fn<LoaderFn>(() => notFound())
    const childLoader = vi.fn<LoaderFn>(() => ({ child: 'preloaded' }))

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: parentLoader,
      notFoundComponent: { preload: notFoundPreload } as any,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: childLoader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory(),
    })
    const finalCommit = gateFinalCommit(router)

    try {
      const navigation = router.navigate({ to: '/parent' })
      await vi.waitFor(() => expect(finalCommit.started).toHaveBeenCalled())
      expect(notFoundPreload).toHaveBeenCalledTimes(1)

      const preload = router.preloadRoute({ to: '/parent/child' })
      await Promise.resolve()

      expect(childLoader).not.toHaveBeenCalled()
      expect(notFoundPreload).toHaveBeenCalledTimes(1)

      finalCommit.gate.resolve()
      const [, preloadResult] = await Promise.all([navigation, preload])

      expect(preloadResult).toBeUndefined()
      expect(childLoader).not.toHaveBeenCalled()
      expect(notFoundPreload).toHaveBeenCalledTimes(1)
      expect(
        router.stores.cachedMatches
          .get()
          .some((match) => match.routeId === childRoute.id),
      ).toBe(false)
    } finally {
      finalCommit.restore()
    }
  })

  test('preload canceled by borrowed owner disappearance projects no assets and caches nothing', async () => {
    const parentLoader = vi.fn<LoaderFn>(() => ({ auth: 'ok' }))
    const childLoader = vi.fn<LoaderFn>(() => ({ child: 'preloaded' }))
    const childHead = vi.fn(() => ({}))

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: parentLoader,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: childLoader,
      head: childHead,
    })
    const otherRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
        otherRoute,
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const finalCommit = gateFinalCommit(router)
    try {
      const parentNavigation = router.navigate({ to: '/parent' })
      await vi.waitFor(() => expect(finalCommit.started).toHaveBeenCalled())

      const preload = router.preloadRoute({ to: '/parent/child' })
      await Promise.resolve()
      expect(childLoader).not.toHaveBeenCalled()

      const otherNavigation = router.navigate({ to: '/other' })
      finalCommit.gate.resolve()
      const [, , preloadResult] = await Promise.all([
        parentNavigation,
        otherNavigation,
        preload,
      ])

      expect(router.state.location.pathname).toBe('/other')
      expect(preloadResult).toBeUndefined()
      expect(childLoader).not.toHaveBeenCalled()
      expect(childHead).not.toHaveBeenCalled()
      expect(
        router.stores.cachedMatches
          .get()
          .some((match) => match.routeId === childRoute.id),
      ).toBe(false)
    } finally {
      finalCommit.restore()
    }
  })

  test('preload does not continue loader-owned descendants when joined active beforeLoad owner exits before settling', async () => {
    vi.useFakeTimers()
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    try {
      const parentBeforeLoadPromise = createControlledPromise<{
        auth: string
      }>()
      const parentBeforeLoad = vi.fn<BeforeLoad>(() => parentBeforeLoadPromise)
      const childBeforeLoad = vi.fn<BeforeLoad>()
      const childLoader = vi.fn(() => undefined)

      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        beforeLoad: parentBeforeLoad,
        pendingMs: 1,
        pendingComponent: {},
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        beforeLoad: childBeforeLoad,
        loader: childLoader,
      })
      const otherRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          indexRoute,
          parentRoute.addChildren([childRoute]),
          otherRoute,
        ]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await router.load()

      const parentNavigation = router.navigate({ to: '/parent' })
      await vi.waitFor(() => expect(parentBeforeLoad).toHaveBeenCalledTimes(1))

      await vi.advanceTimersByTimeAsync(1)
      await vi.waitFor(() =>
        expect(
          router.state.matches.some(
            (match) =>
              match.routeId === parentRoute.id && match.status === 'pending',
          ),
        ).toBe(true),
      )

      const preload = router.preloadRoute({ to: '/parent/child' })
      await Promise.resolve()
      expect(childBeforeLoad).not.toHaveBeenCalled()

      expect(
        router.stores.cachedMatches
          .get()
          .some((match) => match.routeId === childRoute.id),
      ).toBe(false)

      await router.navigate({ to: '/other' })

      parentBeforeLoadPromise.resolve({ auth: 'late' })
      await Promise.all([parentNavigation, preload])

      expect(router.state.location.pathname).toBe('/other')
      expect(childBeforeLoad).not.toHaveBeenCalled()
      expect(childLoader).not.toHaveBeenCalled()
      expect(
        router.stores.cachedMatches
          .get()
          .some((match) => match.routeId === childRoute.id),
      ).toBe(false)
    } finally {
      consoleError.mockRestore()
      vi.useRealTimers()
    }
  })

  test('beforeLoad error commits only the renderable match prefix', async () => {
    const parentHead = vi.fn(({ match }) => ({
      meta: [{ title: match.error ? 'Parent error' : 'Parent success' }],
    }))
    const childHead = vi.fn(() => ({
      meta: [{ title: 'Child success' }],
    }))

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      validateSearch: (search: Record<string, unknown>) => ({
        fail: search.fail === true || search.fail === 'true',
      }),
      beforeLoad: ({ search }) => {
        if (search.fail) {
          throw new Error('Parent beforeLoad failed')
        }
      },
      head: parentHead,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      head: childHead,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({
        initialEntries: ['/parent/child?fail=false'],
      }),
    })

    await router.load()

    expect(router.state.matches.map((match) => match.routeId)).toContain(
      childRoute.id,
    )
    expect(childHead).toHaveBeenCalledTimes(1)

    await router.navigate({
      to: '/parent/child',
      search: { fail: true },
    } as never)

    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
    ])
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id)
        ?.status,
    ).toBe('error')
    expect(parentHead).toHaveBeenCalledTimes(2)
    expect(childHead).toHaveBeenCalledTimes(1)
  })

  test('loader error commits only the renderable match prefix', async () => {
    const parentHead = vi.fn(({ match }) => ({
      meta: [{ title: match.error ? 'Parent error' : 'Parent success' }],
    }))
    const childHead = vi.fn(() => ({
      meta: [{ title: 'Child success' }],
    }))

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      validateSearch: (search: Record<string, unknown>) => ({
        fail: search.fail === true || search.fail === 'true',
      }),
      loaderDeps: ({ search }) => ({ fail: search.fail }),
      loader: (({ deps }) => {
        if ((deps as { fail?: boolean }).fail) {
          throw new Error('Parent loader failed')
        }
      }) as LoaderFn,
      head: parentHead,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      head: childHead,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({
        initialEntries: ['/parent/child?fail=false'],
      }),
    })

    await router.load()

    expect(router.state.matches.map((match) => match.routeId)).toContain(
      childRoute.id,
    )
    expect(childHead).toHaveBeenCalledTimes(1)

    await router.navigate({
      to: '/parent/child',
      search: { fail: true },
    } as never)

    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
    ])
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id)
        ?.status,
    ).toBe('error')
    expect(parentHead).toHaveBeenCalledTimes(2)
    expect(childHead).toHaveBeenCalledTimes(1)
  })

  test('loader errors trim to the shallowest failed match when child fails first', async () => {
    const parentGate = createControlledPromise<void>()
    const parentHead = vi.fn(({ match }) => ({
      meta: [{ title: match.error ? 'Parent error' : 'Parent success' }],
    }))
    const childHead = vi.fn(() => ({
      meta: [{ title: 'Child error' }],
    }))
    const parentLoader = vi.fn<LoaderFn>(async () => {
      await parentGate
      throw new Error('Parent loader failed')
    })
    const childLoader = vi.fn<LoaderFn>(() => {
      throw new Error('Child loader failed')
    })

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: parentLoader,
      head: parentHead,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: childLoader,
      head: childHead,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory(),
    })

    const navigation = router.navigate({ to: '/parent/child' })
    await vi.waitFor(() => expect(childLoader).toHaveBeenCalledTimes(1))

    parentGate.resolve()
    await navigation

    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
    ])
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id)
        ?.status,
    ).toBe('error')
    expect(parentHead).toHaveBeenCalledTimes(1)
    expect(childHead).not.toHaveBeenCalled()
  })

  test('latest load trims when it joins an existing parent loader that later errors', async () => {
    const parentGate = createControlledPromise<void>()
    const parentLoader = vi.fn<LoaderFn>(async () => {
      await parentGate
      throw new Error('Parent loader failed')
    })
    const childHead = vi.fn(() => ({
      meta: [{ title: 'Child should not render' }],
    }))

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: parentLoader,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      head: childHead,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory(),
    })

    const staleNavigation = router.navigate({ to: '/parent/child' })
    await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(1))

    const latestLoad = router.load()
    parentGate.resolve()
    await Promise.allSettled([staleNavigation, latestLoad])

    expect(parentLoader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
    ])
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id)
        ?.status,
    ).toBe('error')
    expect(childHead).not.toHaveBeenCalled()
  })
  ;[
    { name: 'false', value: false },
    { name: '0', value: 0 },
    { name: 'empty string', value: '' },
    { name: 'null', value: null },
    { name: 'undefined', value: undefined },
  ].forEach(({ name, value }) => {
    test(`latest load trims when it joins a parent loader that rejects with ${name}`, async () => {
      const parentGate = createControlledPromise<void>()
      const parentLoader = vi.fn<LoaderFn>(async () => {
        await parentGate
        throw value
      })
      const childHead = vi.fn(() => ({
        meta: [{ title: 'Child should not render' }],
      }))

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: parentLoader,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        head: childHead,
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory(),
      })

      const staleNavigation = router.navigate({ to: '/parent/child' })
      await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(1))

      const latestLoad = router.load()
      parentGate.resolve()
      await Promise.allSettled([staleNavigation, latestLoad])

      const parentMatch = router.state.matches.find(
        (match) => match.routeId === parentRoute.id,
      )
      const expectedError =
        value === undefined
          ? expect.objectContaining({
              message: 'Route load failed with undefined',
            })
          : value

      expect(parentLoader).toHaveBeenCalledTimes(2)
      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        parentRoute.id,
      ])
      expect(parentMatch?.status).toBe('error')
      expect(parentMatch?.error).toEqual(expectedError)
      expect(childHead).not.toHaveBeenCalled()
    })
  })

  test('pending publication runs no lifecycle or cache reconciliation before beforeLoad error final commit', async () => {
    vi.useFakeTimers()

    try {
      const beforeLoadGate = createControlledPromise<void>()
      const parentOnEnter = vi.fn()
      const parentOnStay = vi.fn()
      const childOnEnter = vi.fn()
      const childOnLeave = vi.fn()
      const parentBeforeLoad = vi.fn(async () => {
        await beforeLoadGate
        throw new Error('Parent beforeLoad failed')
      })

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        beforeLoad: parentBeforeLoad,
        pendingMs: 1,
        pendingComponent: {},
        onEnter: parentOnEnter,
        onStay: parentOnStay,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        onEnter: childOnEnter,
        onLeave: childOnLeave,
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory(),
      })
      const setPending = vi.spyOn(router.stores, 'setPending')
      const setCached = vi.spyOn(router.stores, 'setCached')
      const setLoadedAt = vi.spyOn(router.stores.loadedAt, 'set')
      const setIsLoading = vi.spyOn(router.stores.isLoading, 'set')

      const navigation = router.navigate({ to: '/parent/child' })
      await vi.waitFor(() => expect(parentBeforeLoad).toHaveBeenCalledTimes(1))

      const setCachedBeforePending = setCached.mock.calls.length
      const setLoadedAtBeforePending = setLoadedAt.mock.calls.length
      const setIsLoadingBeforePending = setIsLoading.mock.calls.length

      await vi.advanceTimersByTimeAsync(1)
      await vi.waitFor(() =>
        expect(router.state.matches.map((match) => match.routeId)).toEqual([
          rootRoute.id,
          parentRoute.id,
          childRoute.id,
        ]),
      )
      const setPendingAfterPending = setPending.mock.calls.length
      const setCachedAfterPending = setCached.mock.calls.length
      const setLoadedAtAfterPending = setLoadedAt.mock.calls.length
      const setIsLoadingAfterPending = setIsLoading.mock.calls.length

      expect(parentOnEnter).not.toHaveBeenCalled()
      expect(parentOnStay).not.toHaveBeenCalled()
      expect(childOnEnter).not.toHaveBeenCalled()
      expect(childOnLeave).not.toHaveBeenCalled()
      expect(setCached).toHaveBeenCalledTimes(setCachedBeforePending)
      expect(setLoadedAt).toHaveBeenCalledTimes(setLoadedAtBeforePending)
      expect(setIsLoading).toHaveBeenCalledTimes(setIsLoadingBeforePending)

      beforeLoadGate.resolve()
      await navigation

      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        parentRoute.id,
      ])
      expect(
        router.state.matches.find((match) => match.routeId === parentRoute.id)
          ?.status,
      ).toBe('error')
      expect(parentOnEnter).toHaveBeenCalledTimes(1)
      expect(parentOnStay).not.toHaveBeenCalled()
      expect(childOnEnter).not.toHaveBeenCalled()
      expect(childOnLeave).not.toHaveBeenCalled()
      expect(setPending).toHaveBeenCalledTimes(setPendingAfterPending)
      expect(setCached).toHaveBeenCalledTimes(setCachedAfterPending + 1)
      expect(setLoadedAt).toHaveBeenCalledTimes(setLoadedAtAfterPending + 1)
      expect(setIsLoading).toHaveBeenCalledTimes(setIsLoadingAfterPending + 1)
    } finally {
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  test('loader error commits final renderable prefix after pending UI renders', async () => {
    vi.useFakeTimers()

    try {
      const loaderGate = createControlledPromise<void>()
      const parentLoader = vi.fn<LoaderFn>(async () => {
        await loaderGate
        throw new Error('Parent loader failed')
      })

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: parentLoader,
        pendingMs: 1,
        pendingComponent: {},
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory(),
      })

      const navigation = router.navigate({ to: '/parent/child' })
      await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(1))

      await vi.advanceTimersByTimeAsync(1)
      await vi.waitFor(() =>
        expect(router.state.matches.map((match) => match.routeId)).toEqual([
          rootRoute.id,
          parentRoute.id,
          childRoute.id,
        ]),
      )

      loaderGate.resolve()
      await navigation

      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        parentRoute.id,
      ])
      expect(
        router.state.matches.find((match) => match.routeId === parentRoute.id)
          ?.status,
      ).toBe('error')
    } finally {
      vi.useRealTimers()
    }
  })

  test('loader success after pending UI renders performs final reconciliation once', async () => {
    vi.useFakeTimers()

    try {
      const loaderGate = createControlledPromise<void>()
      const parentLoader = vi.fn<LoaderFn>(async () => {
        await loaderGate
      })

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: parentLoader,
        pendingMs: 1,
        pendingComponent: {},
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory(),
      })
      const setMatches = vi.spyOn(router.stores, 'setMatches')
      const setCached = vi.spyOn(router.stores, 'setCached')

      const navigation = router.navigate({ to: '/parent/child' })
      await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(1))

      await vi.advanceTimersByTimeAsync(1)
      await vi.waitFor(() =>
        expect(router.state.matches.map((match) => match.routeId)).toEqual([
          rootRoute.id,
          parentRoute.id,
          childRoute.id,
        ]),
      )
      const setMatchesAfterPending = setMatches.mock.calls.length
      const setCachedAfterPending = setCached.mock.calls.length

      loaderGate.resolve()
      await navigation

      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        parentRoute.id,
        childRoute.id,
      ])
      expect(setMatches).toHaveBeenCalledTimes(setMatchesAfterPending + 1)
      expect(setCached).toHaveBeenCalledTimes(setCachedAfterPending + 1)
    } finally {
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  test('pending publication does not consume the final view transition', async () => {
    vi.useFakeTimers()

    try {
      const loaderGate = createControlledPromise<{ value: string }>()
      const childLoader = vi.fn<LoaderFn>(() => loaderGate)

      const rootRoute = new BaseRootRoute({})
      const childRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/child',
        loader: childLoader,
        pendingMs: 1,
        pendingComponent: {},
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([childRoute]),
        history: createMemoryHistory(),
      })

      const startViewTransition = vi.spyOn(router, 'startViewTransition')

      const navigation = router.navigate({
        to: '/child',
        viewTransition: true,
      })
      await vi.waitFor(() => expect(childLoader).toHaveBeenCalledTimes(1))

      await vi.advanceTimersByTimeAsync(1)
      await vi.waitFor(() => {
        const childMatch = router.state.matches.find(
          (match) => match.routeId === childRoute.id,
        )
        expect(childMatch?.status).toBe('pending')
      })
      expect(startViewTransition).not.toHaveBeenCalled()
      expect(router.shouldViewTransition).toBe(true)

      loaderGate.resolve({ value: 'fresh' })
      await navigation

      const childMatch = router.state.matches.find(
        (match) => match.routeId === childRoute.id,
      )
      expect(childMatch?.status).toBe('success')
      expect(childMatch?.loaderData).toEqual({ value: 'fresh' })
      expect(startViewTransition).toHaveBeenCalledTimes(1)
    } finally {
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  test("stale onReady does not consume a newer navigation's view transition", async () => {
    vi.useFakeTimers()

    try {
      const slowGate = createControlledPromise<void>()
      const fastGate = createControlledPromise<void>()
      const slowLoader = vi.fn<LoaderFn>(() => slowGate)
      const fastLoader = vi.fn<LoaderFn>(() => fastGate)

      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const slowRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/slow',
        loader: slowLoader,
        pendingMs: 0,
        pendingComponent: {},
      })
      const fastRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/fast',
        loader: fastLoader,
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([indexRoute, slowRoute, fastRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })
      await router.load()

      const startViewTransition = vi.spyOn(router, 'startViewTransition')

      const staleNavigation = router.navigate({ to: '/slow' })
      await vi.waitFor(() => expect(slowLoader).toHaveBeenCalledTimes(1))

      await vi.advanceTimersByTimeAsync(0)
      await vi.waitFor(() =>
        expect(router.state.location.pathname).toBe('/slow'),
      )
      expect(startViewTransition).not.toHaveBeenCalled()

      const latestNavigation = router.navigate({
        to: '/fast',
        viewTransition: true,
      })
      await vi.waitFor(() => expect(fastLoader).toHaveBeenCalledTimes(1))

      slowGate.resolve()
      fastGate.resolve()
      await Promise.all([staleNavigation, latestNavigation])

      expect(startViewTransition).toHaveBeenCalledTimes(1)
    } finally {
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  test('redirect resolving while the render-ready commit is pending does not lose or duplicate that commit', async () => {
    vi.useFakeTimers()

    try {
      const slowGate = createControlledPromise<unknown>()
      const slowLoader = vi.fn<LoaderFn>(() => slowGate)

      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const slowRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/slow',
        loader: slowLoader,
        pendingMs: 0,
        pendingComponent: {},
      })
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([indexRoute, slowRoute, targetRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })
      await router.load()

      const startViewTransition = vi.spyOn(router, 'startViewTransition')

      const navigation = router.navigate({ to: '/slow' })
      await vi.waitFor(() => expect(slowLoader).toHaveBeenCalledTimes(1))

      await vi.advanceTimersByTimeAsync(0)
      await vi.waitFor(() =>
        expect(router.state.location.pathname).toBe('/slow'),
      )
      expect(startViewTransition).not.toHaveBeenCalled()

      slowGate.resolve(redirect({ to: '/target' }))
      await vi.waitFor(() =>
        expect(router.state.location.pathname).toBe('/target'),
      )

      await navigation

      expect(router.state.location.pathname).toBe('/target')
      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        targetRoute.id,
      ])
    } finally {
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  test("stale final trim does not disable a newer navigation's view transition", async () => {
    vi.useFakeTimers()

    try {
      const parentGate = createControlledPromise<void>()
      const fastGate = createControlledPromise<void>()
      const parentBeforeLoad = vi.fn<BeforeLoad>(async () => {
        await parentGate
        throw new Error('Parent beforeLoad failed')
      })
      const fastLoader = vi.fn<LoaderFn>(() => fastGate)

      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        beforeLoad: parentBeforeLoad,
        pendingMs: 0,
        pendingComponent: {},
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
      })
      const fastRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/fast',
        loader: fastLoader,
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          indexRoute,
          parentRoute.addChildren([childRoute]),
          fastRoute,
        ]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })
      await router.load()

      const startViewTransition = vi.spyOn(router, 'startViewTransition')

      const staleNavigation = router.navigate({ to: '/parent/child' })
      await vi.waitFor(() => expect(parentBeforeLoad).toHaveBeenCalledTimes(1))

      await vi.advanceTimersByTimeAsync(0)
      await vi.waitFor(() =>
        expect(router.state.location.pathname).toBe('/parent/child'),
      )
      expect(startViewTransition).not.toHaveBeenCalled()

      const latestNavigation = router.navigate({
        to: '/fast',
        viewTransition: true,
      })
      await vi.waitFor(() => expect(fastLoader).toHaveBeenCalledTimes(1))

      parentGate.resolve()
      await Promise.resolve()
      await Promise.resolve()

      expect(startViewTransition).not.toHaveBeenCalled()
      expect(router.shouldViewTransition).toBe(true)

      fastGate.resolve()
      await Promise.all([staleNavigation, latestNavigation])

      expect(startViewTransition).toHaveBeenCalledTimes(1)
    } finally {
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  test('final parent loader-error trim does not cache a dropped successful child', async () => {
    vi.useFakeTimers()

    try {
      const parentGate = createControlledPromise<void>()
      const parentLoader = vi.fn<LoaderFn>(async () => {
        await parentGate
        throw new Error('Parent loader failed')
      })
      const childLoader = vi.fn<LoaderFn>(() => ({ value: 'child' }))

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: parentLoader,
        pendingMs: 1,
        pendingComponent: {},
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: childLoader,
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory(),
      })

      const navigation = router.navigate({ to: '/parent/child' })
      await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(1))

      await vi.advanceTimersByTimeAsync(1)
      await vi.waitFor(() => {
        const childMatch = router.state.matches.find(
          (match) => match.routeId === childRoute.id,
        )
        expect(childMatch?.status).toBe('success')
      })

      parentGate.resolve()
      await navigation

      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        parentRoute.id,
      ])
      expect(
        router.stores.cachedMatches
          .get()
          .some((match) => match.routeId === childRoute.id),
      ).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  test('preload from onBeforeLoad waits for active root beforeLoad context', async () => {
    vi.useFakeTimers()

    try {
      const rootBeforeLoadPromise = createControlledPromise<{ auth: string }>()
      const rootBeforeLoad = vi.fn<BeforeLoad>(() => rootBeforeLoadPromise)
      const childLoader = vi.fn<LoaderFn>(({ context }) => context)

      const rootRoute = new BaseRootRoute({
        beforeLoad: rootBeforeLoad,
      })
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: childLoader,
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory(),
      })

      let preload: ReturnType<typeof router.preloadRoute> | undefined
      const unsubscribe = router.subscribe('onBeforeLoad', (event) => {
        if (!preload && event.toLocation.pathname === '/parent') {
          preload = router.preloadRoute({ to: '/parent/child' })
        }
      })

      try {
        const navigation = router.navigate({ to: '/parent' })
        await vi.advanceTimersByTimeAsync(0)

        expect(rootBeforeLoad).toHaveBeenCalledTimes(1)
        expect(childLoader).not.toHaveBeenCalled()

        rootBeforeLoadPromise.resolve({ auth: 'ok' })
        await navigation
        await preload

        expect(childLoader).toHaveBeenCalledTimes(1)
        expect(childLoader.mock.calls[0]?.[0].context).toMatchObject({
          auth: 'ok',
        })
      } finally {
        unsubscribe()
      }
    } finally {
      vi.useRealTimers()
    }
  })

  test('preload descendant waits for active parent loader data', async () => {
    vi.useFakeTimers()

    try {
      const parentLoaderPromise = createControlledPromise<{ auth: string }>()
      const unexpectedParentPreloadPromise = createControlledPromise<{
        auth: string
      }>()
      const parentLoader = vi.fn<LoaderFn>(({ preload }) => {
        return preload ? unexpectedParentPreloadPromise : parentLoaderPromise
      })
      let childLoaderSettled = false
      const childLoader = vi.fn<LoaderFn>(async ({ parentMatchPromise }) => {
        const parentMatch = (await parentMatchPromise) as any
        childLoaderSettled = true
        return parentMatch.loaderData
      })

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: parentLoader,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: childLoader,
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory(),
      })

      const navigation = router.navigate({ to: '/parent' })
      await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(1))

      const preload = router.preloadRoute({ to: '/parent/child' })
      await vi.advanceTimersByTimeAsync(5)
      expect(parentLoader).toHaveBeenCalledTimes(1)
      expect(childLoader).not.toHaveBeenCalled()
      expect(childLoaderSettled).toBe(false)

      parentLoaderPromise.resolve({ auth: 'ok' })
      await navigation
      await preload

      expect(parentLoader).toHaveBeenCalledTimes(1)
      expect(childLoaderSettled).toBe(true)
      await expect(childLoader.mock.results[0]!.value).resolves.toEqual({
        auth: 'ok',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  test('preload does not start descendant loader when joined active loader owner exits before settling', async () => {
    vi.useFakeTimers()

    try {
      const parentLoaderPromise = createControlledPromise<{ auth: string }>()
      const parentLoader = vi.fn<LoaderFn>(() => parentLoaderPromise)
      let childLoaderSettled = false
      const childLoader = vi.fn<LoaderFn>(async ({ parentMatchPromise }) => {
        await parentMatchPromise
        childLoaderSettled = true
      })
      const childOnError = vi.fn()

      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: parentLoader,
        pendingMs: 1,
        pendingComponent: {},
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: childLoader,
        onError: childOnError,
      })
      const otherRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          indexRoute,
          parentRoute.addChildren([childRoute]),
          otherRoute,
        ]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await router.load()

      const parentNavigation = router.navigate({ to: '/parent' })
      await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(1))

      const preload = router.preloadRoute({ to: '/parent/child' })
      await vi.advanceTimersByTimeAsync(5)
      expect(parentLoader).toHaveBeenCalledTimes(1)
      expect(childLoader).not.toHaveBeenCalled()
      expect(childLoaderSettled).toBe(false)

      await router.navigate({ to: '/other' })

      parentLoaderPromise.resolve({ auth: 'late' })
      await Promise.all([parentNavigation, preload])

      expect(router.state.location.pathname).toBe('/other')
      expect(childLoaderSettled).toBe(false)
      expect(childOnError).not.toHaveBeenCalled()
      expect(
        router.stores.cachedMatches
          .get()
          .some((match) => match.routeId === childRoute.id),
      ).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  test('preload leaves no descendant cache when joined active loader owner exits', async () => {
    vi.useFakeTimers()

    try {
      const parentLoaderPromise = createControlledPromise<{ auth: string }>()
      const parentLoader = vi.fn<LoaderFn>(() => parentLoaderPromise)
      const childLoader = vi.fn<LoaderFn>(() => ({ child: 'preloaded' }))

      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: parentLoader,
        pendingMs: 1,
        pendingComponent: {},
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: childLoader,
      })
      const otherRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          indexRoute,
          parentRoute.addChildren([childRoute]),
          otherRoute,
        ]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await router.load()

      const parentNavigation = router.navigate({ to: '/parent' })
      await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(1))

      const preload = router.preloadRoute({ to: '/parent/child' })
      await Promise.resolve()
      expect(childLoader).not.toHaveBeenCalled()

      await router.navigate({ to: '/other' })

      parentLoaderPromise.resolve({ auth: 'late' })
      await Promise.all([parentNavigation, preload])

      expect(router.state.location.pathname).toBe('/other')
      expect(
        router.stores.cachedMatches
          .get()
          .some((match) => match.routeId === childRoute.id),
      ).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  test('preload resolves when joined active loader owner exits with a never-settling descendant loader', async () => {
    vi.useFakeTimers()

    try {
      const parentLoaderPromise = createControlledPromise<{ auth: string }>()
      const childLoaderPromise = createControlledPromise<void>()
      const parentLoader = vi.fn<LoaderFn>(() => parentLoaderPromise)
      const childLoader = vi.fn<LoaderFn>(() => childLoaderPromise)

      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: parentLoader,
        pendingMs: 1,
        pendingComponent: {},
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: childLoader,
      })
      const otherRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          indexRoute,
          parentRoute.addChildren([childRoute]),
          otherRoute,
        ]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await router.load()

      const parentNavigation = router.navigate({ to: '/parent' })
      await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(1))

      const preloadSettled = vi.fn()
      const preload = router.preloadRoute({ to: '/parent/child' })
      preload.then(preloadSettled)
      await Promise.resolve()
      expect(childLoader).not.toHaveBeenCalled()

      await router.navigate({ to: '/other' })

      parentLoaderPromise.resolve({ auth: 'late' })
      await parentNavigation
      await preload

      expect(preloadSettled).toHaveBeenCalledTimes(1)
      expect(childLoader).not.toHaveBeenCalled()
      expect(
        router.stores.cachedMatches
          .get()
          .some((match) => match.routeId === childRoute.id),
      ).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  test('preload resolves when joined active loader owner exits with a never-settling descendant beforeLoad', async () => {
    vi.useFakeTimers()

    try {
      const parentLoaderPromise = createControlledPromise<{ auth: string }>()
      const childBeforeLoadPromise = createControlledPromise<void>()
      const parentLoader = vi.fn<LoaderFn>(() => parentLoaderPromise)
      const childBeforeLoad = vi.fn<BeforeLoad>(() => childBeforeLoadPromise)

      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: parentLoader,
        pendingMs: 1,
        pendingComponent: {},
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        beforeLoad: childBeforeLoad,
      })
      const otherRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          indexRoute,
          parentRoute.addChildren([childRoute]),
          otherRoute,
        ]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await router.load()

      const parentNavigation = router.navigate({ to: '/parent' })
      await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(1))

      const preloadSettled = vi.fn()
      const preload = router.preloadRoute({ to: '/parent/child' })
      preload.then(preloadSettled)
      await Promise.resolve()
      expect(childBeforeLoad).not.toHaveBeenCalled()

      await router.navigate({ to: '/other' })
      await vi.waitFor(() => expect(preloadSettled).toHaveBeenCalledTimes(1))

      expect(
        router.stores.cachedMatches
          .get()
          .some((match) => match.routeId === childRoute.id),
      ).toBe(false)

      parentLoaderPromise.resolve({ auth: 'late' })
      childBeforeLoadPromise.resolve()
      await Promise.all([parentNavigation, preload])
    } finally {
      vi.useRealTimers()
    }
  })

  test.each([
    {
      name: 'without a never-settling descendant',
      withNeverSettlingDescendant: false,
    },
    {
      name: 'with a never-settling descendant',
      withNeverSettlingDescendant: true,
    },
  ])(
    'preload cancellation skips descendant redirect after owner exit $name',
    async ({ withNeverSettlingDescendant }) => {
      vi.useFakeTimers()
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined)

      try {
        const parentLoaderPromise = createControlledPromise<{ auth: string }>()
        const hangLoaderPromise = createControlledPromise<void>()
        const parentLoader = vi.fn<LoaderFn>(() => parentLoaderPromise)
        const childLoader = vi.fn<LoaderFn>(() => {
          throw redirect({ to: '/target' })
        })
        const hangLoader = vi.fn<LoaderFn>(() => hangLoaderPromise)
        const targetLoader = vi.fn<LoaderFn>(() => undefined)

        const rootRoute = new BaseRootRoute({})
        const indexRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/',
        })
        const parentRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/parent',
          loader: parentLoader,
          pendingMs: 1,
          pendingComponent: {},
        })
        const childRoute = new BaseRoute({
          getParentRoute: () => parentRoute,
          path: '/child',
          loader: childLoader,
        })
        const hangRoute = new BaseRoute({
          getParentRoute: () => childRoute,
          path: '/hang',
          loader: hangLoader,
        })
        const targetRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/target',
          loader: targetLoader,
        })
        const otherRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/other',
        })

        const router = createTestRouter({
          routeTree: rootRoute.addChildren([
            indexRoute,
            parentRoute.addChildren([childRoute.addChildren([hangRoute])]),
            targetRoute,
            otherRoute,
          ]),
          history: createMemoryHistory({ initialEntries: ['/'] }),
        })

        await router.load()

        const parentNavigation = router.navigate({ to: '/parent' })
        await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(1))

        const preloadSettled = vi.fn()
        const preload = router.preloadRoute({
          to: withNeverSettlingDescendant
            ? '/parent/child/hang'
            : '/parent/child',
        })
        preload.then(preloadSettled)

        await Promise.resolve()
        expect(childLoader).not.toHaveBeenCalled()
        expect(hangLoader).not.toHaveBeenCalled()

        await router.navigate({ to: '/other' })

        parentLoaderPromise.resolve({ auth: 'late' })
        await parentNavigation
        await vi.waitFor(() => expect(preloadSettled).toHaveBeenCalledTimes(1))

        expect(router.state.location.pathname).toBe('/other')
        expect(childLoader).not.toHaveBeenCalled()
        expect(hangLoader).not.toHaveBeenCalled()
        expect(targetLoader).not.toHaveBeenCalled()
        expect(consoleError).not.toHaveBeenCalled()
      } finally {
        consoleError.mockRestore()
        vi.useRealTimers()
      }
    },
  )

  test('preload from onBeforeLoad waits for active parent loader data', async () => {
    vi.useFakeTimers()

    try {
      const parentLoaderPromise = createControlledPromise<{ auth: string }>()
      const unexpectedParentPreloadPromise = createControlledPromise<{
        auth: string
      }>()
      const parentLoader = vi.fn<LoaderFn>(({ preload }) => {
        return preload ? unexpectedParentPreloadPromise : parentLoaderPromise
      })
      let childLoaderSettled = false
      const childLoader = vi.fn<LoaderFn>(async ({ parentMatchPromise }) => {
        const parentMatch = (await parentMatchPromise) as any
        childLoaderSettled = true
        return parentMatch.loaderData
      })

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: parentLoader,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: childLoader,
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory(),
      })

      let preload: ReturnType<typeof router.preloadRoute> | undefined
      const unsubscribe = router.subscribe('onBeforeLoad', (event) => {
        if (!preload && event.toLocation.pathname === '/parent') {
          preload = router.preloadRoute({ to: '/parent/child' })
        }
      })

      try {
        const navigation = router.navigate({ to: '/parent' })
        await vi.advanceTimersByTimeAsync(5)

        expect(parentLoader).toHaveBeenCalledTimes(1)
        expect(childLoader).not.toHaveBeenCalled()
        expect(childLoaderSettled).toBe(false)

        parentLoaderPromise.resolve({ auth: 'ok' })
        await navigation
        await preload

        expect(parentLoader).toHaveBeenCalledTimes(1)
        expect(childLoaderSettled).toBe(true)
        await expect(childLoader.mock.results[0]!.value).resolves.toEqual({
          auth: 'ok',
        })
      } finally {
        unsubscribe()
      }
    } finally {
      vi.useRealTimers()
    }
  })

  test('does not execute detached head when loader throws notFound during preload', async () => {
    const loader = vi.fn<LoaderFn>(({ preload }) => {
      if (preload) {
        throw notFound()
      }
    })
    const head = vi.fn(() => ({ meta: [{ title: 'Foo' }] }))

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head,
      notFoundComponent: () => null,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.preloadRoute({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(1)
    expect(head).not.toHaveBeenCalled()
  })

  test('does not execute detached head when beforeLoad throws notFound during preload', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(({ preload }) => {
      if (preload) {
        throw notFound()
      }
    })
    const head = vi.fn(() => ({ meta: [{ title: 'Foo' }] }))

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad,
      head,
      notFoundComponent: () => null,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.preloadRoute({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(head).not.toHaveBeenCalled()
  })

  test('exec if pending preload (error)', async () => {
    const beforeLoad = vi.fn<BeforeLoad>(async ({ preload }) => {
      await sleep(100)
      if (preload) throw new Error('error')
    })
    const router = setup({
      beforeLoad,
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(2)
  })
})

describe('loader skip or exec', () => {
  const setup = ({
    loader,
    staleTime,
    defaultStaleReloadMode,
  }: {
    loader?: Loader
    staleTime?: number
    defaultStaleReloadMode?: LoaderStaleReloadMode
  }) => {
    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      staleTime,
      gcTime: staleTime,
    })

    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })

    const routeTree = rootRoute.addChildren([fooRoute, barRoute])

    const router = createTestRouter({
      routeTree,
      defaultStaleReloadMode,
      history: createMemoryHistory(),
    })

    return router
  }

  test('baseline', async () => {
    const loader = vi.fn()
    const router = setup({ loader })
    await router.load()
    expect(loader).toHaveBeenCalledTimes(0)
  })

  test('does not call shouldReload on initial pending load', async () => {
    const loader = vi.fn()
    const shouldReload = vi.fn(() => false)

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      shouldReload,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/foo'] }),
    })

    await router.load()

    expect(loader).toHaveBeenCalledTimes(1)
    expect(shouldReload).not.toHaveBeenCalled()
  })

  test('client forceStaleReload reloads stale same-url matches', async () => {
    const loader = vi.fn(() => ({ loaded: true }))
    const router = setup({ loader, staleTime: 0 })

    await router.navigate({ to: '/foo' })
    await router.load({ sync: true })

    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('client blocking reload clears loaderData when loader returns undefined', async () => {
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      return loaderCalls === 1 ? 'old' : undefined
    })
    const head = vi.fn(({ loaderData }) => ({
      meta: [{ title: String(loaderData) }],
    }))
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head,
      staleTime: 0,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
      defaultStaleReloadMode: 'blocking',
    })

    const getFooMatch = () =>
      router.state.matches.find((match) => match.routeId === fooRoute.id)

    await router.navigate({ to: '/foo' })
    expect(getFooMatch()?.loaderData).toBe('old')
    expect(getFooMatch()?.meta).toEqual([{ title: 'old' }])

    await router.load({ sync: true })

    const match = getFooMatch()
    expect(loader).toHaveBeenCalledTimes(2)
    expect(match?.loaderData).toBeUndefined()
    expect(match?.status).toBe('success')
    expect(match?.meta).toEqual([{ title: 'undefined' }])
  })

  test('server load ignores staleTime and shouldReload', async () => {
    const loader = vi.fn(() => ({ loaded: true }))
    const shouldReload = vi.fn(() => false)

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      staleTime: Infinity,
      shouldReload,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/foo'] }),
      isServer: true,
    })

    await router.load()
    await router.load({ sync: true })

    expect(loader).toHaveBeenCalledTimes(2)
    expect(shouldReload).not.toHaveBeenCalled()
  })

  test('preloading an active route joins the active match', async () => {
    const loader = vi.fn(() => ({ source: 'active' }))
    const router = setup({ loader })

    await router.navigate({ to: '/foo' })
    expectNoCachedActiveOverlap(router)

    const activeMatch = router.state.matches.find((match) =>
      match.id.endsWith('/foo'),
    )!

    const matches = await router.preloadRoute({ to: '/foo' })
    const preloadedMatch = matches?.find((match) => match.id === activeMatch.id)

    expect(loader).toHaveBeenCalledTimes(1)
    expect(preloadedMatch?.loaderData).toEqual({ source: 'active' })
    expectNoCachedActiveOverlap(router)
  })

  test('active preload does not execute active head hooks', async () => {
    const loader = vi.fn(() => ({ source: 'active' }))
    const head = vi.fn(() => ({ meta: [{ title: 'Foo' }] }))

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    expect(head).toHaveBeenCalledTimes(1)

    await router.preloadRoute({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(1)
    expect(head).toHaveBeenCalledTimes(1)
  })

  test('preload ownership may be non-contiguous when ancestor loaderDeps change', async () => {
    const parentLoader = vi.fn(() => ({ source: 'parent' }))
    const childLoader = vi.fn(() => ({ source: 'child' }))
    const childHead = vi.fn(() => ({ meta: [{ title: 'Child' }] }))

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: parentLoader,
      loaderDeps: ({ search }: { search: Record<string, unknown> }) => ({
        parentVersion: search['parentVersion'],
      }),
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: childLoader,
      loaderDeps: () => ({ childVersion: 'stable' }),
      head: childHead,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory(),
    })

    await router.navigate({
      to: '/parent/child',
      search: { parentVersion: '1' },
    })
    expectNoCachedActiveOverlap(router)

    const activeParent = router.state.matches.find(
      (match) => match.routeId === parentRoute.id,
    )!
    const activeChild = router.state.matches.find(
      (match) => match.routeId === childRoute.id,
    )!

    const preloadedMatches = await router.preloadRoute({
      to: '/parent/child',
      search: { parentVersion: '2' },
    })

    const preloadedParent = preloadedMatches?.find(
      (match) => match.routeId === parentRoute.id,
    )!
    const preloadedChild = preloadedMatches?.find(
      (match) => match.routeId === childRoute.id,
    )!

    expect(preloadedParent.id).not.toBe(activeParent.id)
    expect(preloadedChild.id).toBe(activeChild.id)
    expect(parentLoader).toHaveBeenCalledTimes(2)
    expect(childLoader).toHaveBeenCalledTimes(1)
    expect(childHead).toHaveBeenCalledTimes(1)
    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.id === activeChild.id),
    ).toBe(false)
    expectNoCachedActiveOverlap(router)
  })

  test('preloadRoute returns cache-owned matches with loaderData after load', async () => {
    const loader = vi.fn(() => ({ source: 'preload' }))
    const router = setup({ loader })

    const matches = await router.preloadRoute({ to: '/foo' })
    const match = matches?.find((d) => d.id === '/foo/foo')

    expect(loader).toHaveBeenCalledTimes(1)
    expect(match?.loaderData).toEqual({ source: 'preload' })
  })

  test('navigation to a preloaded route commits head assets', async () => {
    const loader = vi.fn(() => ({ title: 'Preloaded title' }))
    const head = vi.fn(({ loaderData }) => ({
      meta: [{ title: loaderData.title }],
    }))

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head,
      staleTime: 60_000,
      preloadStaleTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.preloadRoute({ to: '/foo' })
    await router.navigate({ to: '/foo' })

    const match = router.state.matches.find((item) => item.id === '/foo/foo')
    expect(loader).toHaveBeenCalledTimes(1)
    expect(head).toHaveBeenCalled()
    expect(match?.meta).toEqual([{ title: 'Preloaded title' }])
  })

  test('head assetContext.matches sees lane-updated loaderData', async () => {
    const parentLoader = vi.fn(() => ({ parent: 'data' }))
    const seenParentLoaderData: Array<unknown> = []

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: parentLoader,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      head: ({ matches }) => {
        seenParentLoaderData.push(
          matches.find((match) => match.routeId === parentRoute.id)?.loaderData,
        )
        return { meta: [{ title: 'Child' }] }
      },
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory(),
    })

    await router.preloadRoute({ to: '/parent/child' })

    expect(parentLoader).toHaveBeenCalledTimes(1)
    expect(seenParentLoaderData).toEqual([{ parent: 'data' }])
  })

  test('active redirect settles source loadPromise without cached ownership', async () => {
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader: () => redirect({ to: '/bar' }),
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute, barRoute]),
      history: createMemoryHistory({ initialEntries: ['/foo'] }),
    })

    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    const fooMatch = matches.find((match) => match.routeId === fooRoute.id)!
    const activeLoadPromise = fooMatch._.loadPromise

    router.stores.setPending(matches)
    expectNoCachedActiveOverlap(router)

    await expect(
      loadMatches({
        router,
        location,
        matches,
      }),
    ).rejects.toMatchObject({
      options: expect.objectContaining({ to: '/bar' }),
    })

    expect(activeLoadPromise?.status).toBe('resolved')
    expect(fooMatch._.loadPromise).toBeUndefined()
    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.id === fooMatch.id),
    ).toBe(false)
    expectNoCachedActiveOverlap(router)
  })

  test('exec on regular nav', async () => {
    const loader = vi.fn(() => Promise.resolve({ hello: 'world' }))
    const router = setup({ loader })
    const navigation = router.navigate({ to: '/foo' })
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.stores.pendingMatches.get()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: '/foo/foo' })]),
    )
    await navigation
    expect(router.state.location.pathname).toBe('/foo')
    expect(router.state.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '/foo/foo',
          loaderData: {
            hello: 'world',
          },
        }),
      ]),
    )
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test.each([false, true])(
    'handles %s async returned redirects from loader',
    async (asyncReturn) => {
      const loader = vi.fn<LoaderFn>(() => {
        const result = redirect({ to: '/bar' })
        return asyncReturn ? Promise.resolve(result) : result
      })
      const router = setup({ loader })

      await router.navigate({ to: '/foo' })

      expect(router.state.location.pathname).toBe('/bar')
      expect(loader).toHaveBeenCalledTimes(1)
    },
  )

  test.each([false, true])(
    'handles %s async returned notFounds from loader',
    async (asyncReturn) => {
      const rootRoute = new BaseRootRoute({})
      const fooRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/foo',
        loader: () => {
          const result = notFound()
          return asyncReturn ? Promise.resolve(result) : result
        },
        notFoundComponent: () => null,
      })

      const routeTree = rootRoute.addChildren([fooRoute])
      const router = createTestRouter({
        routeTree,
        history: createMemoryHistory(),
      })

      await router.navigate({ to: '/foo' })

      const match = router.state.matches.find((m) => m.routeId === fooRoute.id)
      expect(match?.status).toBe('notFound')
    },
  )

  test('settles descendant match when notFound renders an ancestor boundary', async () => {
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      notFoundComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: () => notFound({ routeId: parentRoute.id }),
    })

    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
    ])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/parent/child' })

    const parentMatch = router.state.matches.find(
      (m) => m.routeId === parentRoute.id,
    )
    const childMatch = router.state.matches.find(
      (m) => m.routeId === childRoute.id,
    )
    expect(parentMatch?.status).toBe('notFound')
    expect(childMatch).toBeUndefined()
  })

  test('exec if resolved preload (success)', async () => {
    const loader = vi.fn()
    const router = setup({ loader })
    await router.preloadRoute({ to: '/foo' })
    expect(router.stores.cachedMatches.get()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: '/foo/foo' })]),
    )
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('skip if resolved preload (success) within staleTime duration', async () => {
    const loader = vi.fn()
    const router = setup({ loader, staleTime: 1000 })
    await router.preloadRoute({ to: '/foo' })
    expect(router.stores.cachedMatches.get()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: '/foo/foo' })]),
    )
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('exec if pending preload (success)', async () => {
    const loader = vi.fn(() => sleep(100))
    const router = setup({ loader })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    expect(router.stores.cachedMatches.get()).toEqual([])
    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('exec if rejected preload (notFound)', async () => {
    const loader: Loader = vi.fn(async ({ preload }) => {
      if (preload) throw notFound()
      await Promise.resolve()
    })
    const router = setup({
      loader,
    })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('exec if pending preload (notFound)', async () => {
    const loader: Loader = vi.fn(async ({ preload }) => {
      await sleep(100)
      if (preload) throw notFound()
    })
    const router = setup({
      loader,
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('exec if rejected preload (redirect)', async () => {
    const loader: Loader = vi.fn(async ({ preload }) => {
      if (preload) throw redirect({ to: '/bar' })
      await Promise.resolve()
    })
    const router = setup({
      loader,
    })
    await router.preloadRoute({ to: '/foo' })
    expect(
      router.stores.cachedMatches.get().some((d) => d.id === '/foo/foo'),
    ).toBe(false)
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/foo')
    expect(
      router.stores.cachedMatches.get().some((d) => d.id === '/foo/foo'),
    ).toBe(false)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('exec if pending preload (redirect)', async () => {
    const loader: Loader = vi.fn(async ({ preload }) => {
      await sleep(100)
      if (preload) throw redirect({ to: '/bar' })
    })
    const router = setup({
      loader,
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(router.state.location.pathname).toBe('/foo')
    expect(
      router.stores.cachedMatches.get().some((d) => d.id === '/foo/foo'),
    ).toBe(false)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('private pending preload redirect does not affect active pending navigation', async () => {
    vi.useFakeTimers()

    try {
      const rejectFoo: Array<(error: unknown) => void> = []
      const resolveFoo: Array<() => void> = []
      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const fooRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/foo',
        pendingMs: 1,
        pendingComponent: {},
        loader: () =>
          new Promise<void>((resolve, reject) => {
            resolveFoo.push(resolve)
            rejectFoo.push(reject)
          }),
      })
      const barRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/bar',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([indexRoute, fooRoute, barRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await router.load()

      const preload = router.preloadRoute({ to: '/foo' })
      await vi.waitFor(() => expect(rejectFoo).toHaveLength(1))

      const navigation = router.navigate({ to: '/foo' })
      await vi.waitFor(() => expect(rejectFoo).toHaveLength(2))
      await vi.advanceTimersByTimeAsync(1)
      await vi.waitFor(() =>
        expect(
          router.state.matches.some(
            (match) => match.id === '/foo/foo' && match.status === 'pending',
          ),
        ).toBe(true),
      )

      rejectFoo[0]!(redirect({ to: '/bar' }))
      await preload

      expect(
        router.state.matches.find((match) => match.id === '/foo/foo')?.status,
      ).toBe('pending')
      expect(router.state.location.pathname).toBe('/foo')

      resolveFoo[1]!()
      await navigation

      expect(router.state.location.pathname).toBe('/foo')
    } finally {
      vi.useRealTimers()
    }
  })

  test('active-join preload observes active redirect after settling active owner loadPromise', async () => {
    vi.useFakeTimers()

    try {
      let rejectFoo!: (error: unknown) => void
      let resolveBar!: () => void
      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const fooRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/foo',
        pendingMs: 1,
        pendingComponent: {},
        loader: () =>
          new Promise((_resolve, reject) => {
            rejectFoo = reject
          }),
      })
      const barRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/bar',
        loader: () =>
          new Promise<void>((resolve) => {
            resolveBar = resolve
          }),
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([indexRoute, fooRoute, barRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await router.load()

      const navigation = router.navigate({ to: '/foo' })
      await vi.waitFor(() => expect(rejectFoo).toBeTypeOf('function'))
      await vi.advanceTimersByTimeAsync(1)
      await vi.waitFor(() =>
        expect(
          router.state.matches.some(
            (match) => match.id === '/foo/foo' && match.status === 'pending',
          ),
        ).toBe(true),
      )

      const activeFoo = router.state.matches.find(
        (match) => match.id === '/foo/foo',
      )!
      const activeLoadPromise = activeFoo._.loadPromise
      expect(activeLoadPromise?.status).toBe('pending')

      const preload = router.preloadRoute({ to: '/foo' })
      await Promise.resolve()

      rejectFoo(redirect({ to: '/bar' }))
      await vi.waitFor(() =>
        expect(
          router.stores.pendingMatches
            .get()
            .some((match) => match.id === '/bar/bar'),
        ).toBe(true),
      )

      expect(activeLoadPromise?.status).toBe('resolved')
      expect(activeFoo._.loadPromise).toBeUndefined()

      resolveBar()
      await Promise.all([navigation, preload])

      expect(router.state.location.pathname).toBe('/bar')
    } finally {
      vi.useRealTimers()
    }
  })

  test.each([
    { name: 'false', value: false },
    { name: '0', value: 0 },
    { name: 'empty string', value: '' },
    { name: 'null', value: null },
    { name: 'undefined', value: undefined },
  ])(
    'borrowed active error with $name stops preload descendants',
    async ({ value }) => {
      const originalNodeEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      try {
        const childBeforeLoad = vi.fn()
        const childLoader = vi.fn(() => 'child')
        const childHead = vi.fn(() => ({}))
        const rootRoute = new BaseRootRoute({})
        const parentRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/parent',
          loader: () => {
            throw value
          },
          errorComponent: () => null,
        })
        const childRoute = new BaseRoute({
          getParentRoute: () => parentRoute,
          path: '/child',
          beforeLoad: childBeforeLoad,
          loader: childLoader,
          head: childHead,
        })
        const router = createTestRouter({
          routeTree: rootRoute.addChildren([
            parentRoute.addChildren([childRoute]),
          ]),
          history: createMemoryHistory(),
        })

        await router.navigate({ to: '/parent' })
        const activeParent = router.state.matches.find(
          (match) => match.routeId === parentRoute.id,
        )
        expect(activeParent?.status).toBe('error')
        expect(activeParent?.error).toBe(value)

        await router.preloadRoute({ to: '/parent/child' })

        expect(childBeforeLoad).not.toHaveBeenCalled()
        expect(childLoader).not.toHaveBeenCalled()
        expect(childHead).not.toHaveBeenCalled()
        expect(
          router.stores.cachedMatches
            .get()
            .some((match) => match.routeId === childRoute.id),
        ).toBe(false)
      } finally {
        process.env.NODE_ENV = originalNodeEnv
      }
    },
  )

  test('exec if rejected preload (error)', async () => {
    const loader: Loader = vi.fn(async ({ preload }) => {
      if (preload) throw new Error('error')
      await Promise.resolve()
    })
    const router = setup({
      loader,
    })
    await router.preloadRoute({ to: '/foo' })
    await sleep(10)
    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('exec if pending preload (error)', async () => {
    const loader: Loader = vi.fn(async ({ preload }) => {
      await sleep(100)
      if (preload) throw new Error('error')
    })
    const router = setup({
      loader,
    })
    router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    await router.navigate({ to: '/foo' })

    expect(loader).toHaveBeenCalledTimes(2)
  })
})

test('exec on stay (beforeLoad & loader)', async () => {
  let rootBeforeLoadResolved = false
  const rootBeforeLoad = vi.fn(async () => {
    await sleep(10)
    rootBeforeLoadResolved = true
  })
  const rootLoader = vi.fn(() => sleep(10))
  const rootRoute = new BaseRootRoute({
    beforeLoad: rootBeforeLoad,
    loader: rootLoader,
  })

  let layoutBeforeLoadResolved = false
  const layoutBeforeLoad = vi.fn(async () => {
    await sleep(10)
    layoutBeforeLoadResolved = true
  })
  const layoutLoader = vi.fn(() => sleep(10))
  const layoutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    beforeLoad: layoutBeforeLoad,
    loader: layoutLoader,
    id: '/_layout',
  })

  const fooRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/foo',
  })
  const barRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/bar',
  })

  const routeTree = rootRoute.addChildren([
    layoutRoute.addChildren([fooRoute, barRoute]),
  ])

  const router = createTestRouter({
    routeTree,
    history: createMemoryHistory(),
    defaultStaleTime: 1000,
    defaultGcTime: 1000,
  })

  await router.navigate({ to: '/foo' })
  expect(router.state.location.pathname).toBe('/foo')

  rootBeforeLoadResolved = false
  layoutBeforeLoadResolved = false
  vi.clearAllMocks()

  /*
   * When navigating between sibling routes,
   * do the parent routes get re-executed?
   */

  await router.navigate({ to: '/bar' })
  expect(router.state.location.pathname).toBe('/bar')

  // beforeLoads always re-execute
  expect(rootBeforeLoad).toHaveBeenCalledTimes(1)
  expect(layoutBeforeLoad).toHaveBeenCalledTimes(1)

  // beforeLoads are called in order
  expect(rootBeforeLoad.mock.invocationCallOrder[0]).toBeLessThan(
    layoutBeforeLoad.mock.invocationCallOrder[0]!,
  )

  // loaders are skipped because of staleTime
  expect(rootLoader).toHaveBeenCalledTimes(0)
  expect(layoutLoader).toHaveBeenCalledTimes(0)

  // beforeLoad calls were correctly awaited
  expect(rootBeforeLoadResolved).toBe(true)
  expect(layoutBeforeLoadResolved).toBe(true)
})

describe('stale loader reload triggers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const getMatchById = (
    router: RouterCore<any, any, any, any, any>,
    id: string,
  ) =>
    router.state.matches.find((match) => match.id === id) ??
    router.stores.pendingMatches.get().find((match) => match.id === id) ??
    router.stores.cachedMatches.get().find((match) => match.id === id)

  const hasActiveMatch = (
    router: RouterCore<any, any, any, any, any>,
    id: string,
  ) => router.state.matches.some((match) => match.id === id)

  const hasPendingMatch = (
    router: RouterCore<any, any, any, any, any>,
    id: string,
  ) =>
    router.stores.pendingMatches.get().some((match) => match.id === id) ?? false

  const getTitle = (match?: AnyRouteMatch) =>
    (match?.meta as Array<{ title?: string }> | undefined)?.find(
      (item) => item.title,
    )?.title

  const setup = ({
    loader,
    staleTime,
    defaultStaleReloadMode,
  }: {
    loader?: Loader
    staleTime?: number
    defaultStaleReloadMode?: LoaderStaleReloadMode
  }) => {
    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      staleTime,
      gcTime: 60_000,
    })

    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })

    const bazRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/baz',
    })

    const routeTree = rootRoute.addChildren([fooRoute, barRoute, bazRoute])

    return createTestRouter({
      routeTree,
      defaultStaleReloadMode,
      history: createMemoryHistory(),
    })
  }

  const createControlledStaleReload = () => {
    let resolveStaleReload: (() => void) | undefined
    let callCount = 0

    const loader = vi.fn(() => {
      callCount += 1
      if (callCount === 1) {
        return { value: 'first' }
      }

      return new Promise<{ value: string }>((resolve) => {
        resolveStaleReload = () => resolve({ value: 'second' })
      })
    })

    return {
      loader,
      resolveStaleReload: () => resolveStaleReload?.(),
    }
  }

  const expectBlockingStaleReloadBehavior = async (
    router: RouterCore<any, any, any, any, any>,
    loader: ReturnType<typeof vi.fn>,
    resolveStaleReload: () => void,
  ) => {
    await router.navigate({ to: '/foo' })
    expect(loader).toHaveBeenCalledTimes(1)
    expect(getMatchById(router, '/foo/foo')?.loaderData).toEqual({
      value: 'first',
    })

    await vi.advanceTimersByTimeAsync(1)
    await router.navigate({ to: '/bar' })
    await vi.advanceTimersByTimeAsync(1)
    expectNoCachedActiveOverlap(router)

    const revisit = router.navigate({ to: '/foo' })
    await Promise.resolve()

    expect(loader).toHaveBeenCalledTimes(2)
    expect(hasActiveMatch(router, '/bar/bar')).toBe(true)
    expect(hasActiveMatch(router, '/foo/foo')).toBe(false)
    expect(hasPendingMatch(router, '/foo/foo')).toBe(true)
    expect(getMatchById(router, '/foo/foo')?.loaderData).toEqual({
      value: 'first',
    })
    expectNoCachedActiveOverlap(router)

    resolveStaleReload()
    await revisit

    expect(loader).toHaveBeenCalledTimes(2)
    expect(hasActiveMatch(router, '/foo/foo')).toBe(true)
    expect(hasPendingMatch(router, '/foo/foo')).toBe(false)
    expect(router.state.location.pathname).toBe('/foo')
    expect(getMatchById(router, '/foo/foo')?.loaderData).toEqual({
      value: 'second',
    })
    expectNoCachedActiveOverlap(router)
  }

  const expectBackgroundStaleReloadBehavior = async (
    router: RouterCore<any, any, any, any, any>,
    loader: ReturnType<typeof vi.fn>,
    resolveStaleReload: () => void,
  ) => {
    await router.navigate({ to: '/foo' })
    expect(loader).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await router.navigate({ to: '/bar' })
    await vi.advanceTimersByTimeAsync(1)
    expectNoCachedActiveOverlap(router)

    const revisit = router.navigate({ to: '/foo' })

    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))

    await revisit

    expect(hasActiveMatch(router, '/foo/foo')).toBe(true)
    expect(hasPendingMatch(router, '/foo/foo')).toBe(false)
    expect(router.state.location.pathname).toBe('/foo')
    expect(getMatchById(router, '/foo/foo')?.loaderData).toEqual({
      value: 'first',
    })
    expect(getMatchById(router, '/foo/foo')?.isFetching).toBe('loader')
    expectNoCachedActiveOverlap(router)

    resolveStaleReload()

    await vi.waitFor(() =>
      expect(getMatchById(router, '/foo/foo')?.loaderData).toEqual({
        value: 'second',
      }),
    )
    expect(getMatchById(router, '/foo/foo')?.isFetching).toBe(false)
    expectNoCachedActiveOverlap(router)
  }

  test('skips stale loader when only unrelated search params change', async () => {
    const rootRoute = new BaseRootRoute({})
    const loader = vi.fn(() => ({ ok: true }))

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      staleTime: 0,
      gcTime: 0,
      loaderDeps: ({ search }: { search: Record<string, unknown> }) => ({
        page: search['page'],
      }),
    })

    const routeTree = rootRoute.addChildren([fooRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo', search: { page: '1', filter: 'a' } })
    expect(loader).toHaveBeenCalledTimes(1)

    await router.navigate({ to: '/foo', search: { page: '1', filter: 'b' } })

    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('reloads stale loader when loader deps change', async () => {
    const rootRoute = new BaseRootRoute({})
    const loader = vi.fn(() => ({ ok: true }))

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      staleTime: 0,
      gcTime: 0,
      loaderDeps: ({ search }: { search: Record<string, unknown> }) => ({
        page: search['page'],
      }),
    })

    const routeTree = rootRoute.addChildren([fooRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo', search: { page: '1' } })
    expect(loader).toHaveBeenCalledTimes(1)

    await router.navigate({ to: '/foo', search: { page: '2' } })

    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('reloads a stale preloaded loader when switching to a different match id of the same route', async () => {
    const rootRoute = new BaseRootRoute({})
    const rootLoader = vi.fn(() => ({ ok: true }))
    const childLoader = vi.fn(() => ({ ok: true }))

    const rootChildRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      loader: rootLoader,
      staleTime: 0,
      gcTime: 0,
      loaderDeps: ({ search }: { search: Record<string, unknown> }) => ({
        page: search['page'],
      }),
    })

    const leafRoute = new BaseRoute({
      getParentRoute: () => rootChildRoute,
      path: '/$postId',
      loader: childLoader,
      staleTime: 0,
      gcTime: 0,
    })

    const routeTree = rootRoute.addChildren([
      rootChildRoute.addChildren([leafRoute]),
    ])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({
      to: '/posts/$postId',
      params: { postId: '1' },
      search: { page: '1' },
    })

    expect(rootLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveBeenCalledTimes(1)

    await router.preloadRoute({
      to: '/posts/$postId',
      params: { postId: '2' },
      search: { page: '2' },
    })

    expect(rootLoader).toHaveBeenCalledTimes(2)
    expect(childLoader).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1)

    await router.navigate({
      to: '/posts/$postId',
      params: { postId: '2' },
      search: { page: '2' },
    })

    expect(rootLoader).toHaveBeenCalledTimes(3)
    expect(childLoader).toHaveBeenCalledTimes(3)
  })

  test('skips stale ancestor loader when only a child path param changes', async () => {
    const rootRoute = new BaseRootRoute({})
    const parentLoader = vi.fn(() => ({ ok: true }))
    const childLoader = vi.fn(() => ({ ok: true }))

    const orgRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/orgs/$orgId',
      loader: parentLoader,
      staleTime: 0,
      gcTime: 0,
    })

    const userRoute = new BaseRoute({
      getParentRoute: () => orgRoute,
      path: '/users/$userId',
      loader: childLoader,
      staleTime: 0,
      gcTime: 0,
    })

    const routeTree = rootRoute.addChildren([orgRoute.addChildren([userRoute])])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({
      to: '/orgs/$orgId/users/$userId',
      params: { orgId: 'acme', userId: 'u1' },
    })
    expect(parentLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveBeenCalledTimes(1)

    await router.navigate({
      to: '/orgs/$orgId/users/$userId',
      params: { orgId: 'acme', userId: 'u2' },
    })

    expect(parentLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveBeenCalledTimes(2)
  })

  test('reloads stale ancestor loader when its own path param changes', async () => {
    const rootRoute = new BaseRootRoute({})
    const parentLoader = vi.fn(() => ({ ok: true }))
    const childLoader = vi.fn(() => ({ ok: true }))

    const orgRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/orgs/$orgId',
      loader: parentLoader,
      staleTime: 0,
      gcTime: 0,
    })

    const userRoute = new BaseRoute({
      getParentRoute: () => orgRoute,
      path: '/users/$userId',
      loader: childLoader,
      staleTime: 0,
      gcTime: 0,
    })

    const routeTree = rootRoute.addChildren([orgRoute.addChildren([userRoute])])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({
      to: '/orgs/$orgId/users/$userId',
      params: { orgId: 'acme', userId: 'u1' },
    })
    expect(parentLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveBeenCalledTimes(1)

    await router.navigate({
      to: '/orgs/$orgId/users/$userId',
      params: { orgId: 'beta', userId: 'u2' },
    })

    expect(parentLoader).toHaveBeenCalledTimes(2)
    expect(childLoader).toHaveBeenCalledTimes(2)
  })

  test('revalidates stale loaders on explicit same-location router.load()', async () => {
    const rootRoute = new BaseRootRoute({})
    const loader = vi.fn(() => ({ ok: true }))

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      staleTime: 0,
      gcTime: 0,
      loaderDeps: ({ search }: { search: Record<string, unknown> }) => ({
        page: search['page'],
      }),
    })

    const routeTree = rootRoute.addChildren([fooRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo', search: { page: '1', filter: 'a' } })
    expect(loader).toHaveBeenCalledTimes(1)
    expectNoCachedActiveOverlap(router)

    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await Promise.resolve()

    expect(loader).toHaveBeenCalledTimes(2)
    expectNoCachedActiveOverlap(router)
  })

  test('supports object-form loader handler', async () => {
    const handler = vi.fn(() => ({ ok: true }))
    const router = setup({
      loader: {
        handler,
      } satisfies LoaderEntry,
    })

    await router.navigate({ to: '/foo' })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(router.state.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '/foo/foo',
          loaderData: { ok: true },
        }),
      ]),
    )
  })

  test('reloads stale loaders in the background by default', async () => {
    const { loader, resolveStaleReload } = createControlledStaleReload()
    const router = setup({ loader, staleTime: 0 })

    await expectBackgroundStaleReloadBehavior(
      router,
      loader,
      resolveStaleReload,
    )
  })

  test('async background stale reload runs head once with fresh loaderData', async () => {
    let resolveStaleReload!: (data: { title: string }) => void
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return null
      }

      return new Promise<{ title: string }>((resolve) => {
        resolveStaleReload = resolve
      })
    })
    const seenLoaderData: Array<unknown> = []
    const head = vi.fn(({ loaderData }) => {
      seenLoaderData.push(loaderData)
      return {
        meta: [
          {
            title: loaderData?.title ?? 'Article Not Found',
          },
        ],
      }
    })

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head,
      staleTime: 0,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    expect(head).toHaveBeenCalledTimes(1)
    expect(seenLoaderData).toEqual([null])

    head.mockClear()
    seenLoaderData.length = 0

    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))

    expect(getMatchById(router, '/foo/foo')?.isFetching).toBe('loader')
    expect(head).not.toHaveBeenCalled()

    resolveStaleReload({ title: 'Article 123 Title' })
    await vi.waitFor(() => expect(head).toHaveBeenCalledTimes(1))

    expect(head).toHaveBeenCalledTimes(1)
    expect(seenLoaderData).toEqual([{ title: 'Article 123 Title' }])
  })

  test('client background reload clears loaderData when loader returns undefined', async () => {
    let resolveStaleReload!: (data: undefined) => void
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return 'old'
      }

      return new Promise<undefined>((resolve) => {
        resolveStaleReload = resolve
      })
    })
    const head = vi.fn(({ loaderData }) => ({
      meta: [{ title: String(loaderData) }],
    }))

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head,
      staleTime: 0,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    const matchId = router.state.matches.find(
      (match) => match.routeId === fooRoute.id,
    )!.id
    expect(getMatchById(router, matchId)?.loaderData).toBe('old')
    expect(getMatchById(router, matchId)?.meta).toEqual([{ title: 'old' }])

    const matchStore = router.stores.matchStores.get(matchId)! as any
    const seen: Array<{ loaderData: unknown; title?: string }> = []
    const subscription = matchStore.subscribe(() => {
      const match = getMatchById(router, matchId)
      seen.push({
        loaderData: match?.loaderData,
        title: getTitle(match),
      })
    })

    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))

    expect(getMatchById(router, matchId)?.isFetching).toBe('loader')

    resolveStaleReload(undefined)
    await vi.waitFor(() =>
      expect(getMatchById(router, matchId)?.isFetching).toBe(false),
    )
    subscription?.unsubscribe?.()

    const match = getMatchById(router, matchId)
    expect(match?.loaderData).toBeUndefined()
    expect(match?.status).toBe('success')
    expect(match?.meta).toEqual([{ title: 'undefined' }])
    expect(seen).not.toContainEqual({
      loaderData: 'old',
      title: 'undefined',
    })
    expect(seen).not.toContainEqual({
      loaderData: undefined,
      title: 'old',
    })
  })

  test('production background loader throw undefined commits an error match', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      let loaderCalls = 0
      const loader = vi.fn(() => {
        loaderCalls += 1
        if (loaderCalls === 1) {
          return { title: 'initial' }
        }

        throw undefined
      })
      const rootRoute = new BaseRootRoute({})
      const fooRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/foo',
        loader,
        staleTime: 0,
        gcTime: 60_000,
        errorComponent: () => null,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([fooRoute]),
        history: createMemoryHistory(),
      })

      await router.navigate({ to: '/foo' })
      await vi.advanceTimersByTimeAsync(1)
      await router.load()

      await vi.waitFor(() =>
        expect(getMatchById(router, '/foo/foo')?.status).toBe('error'),
      )
      expect(getMatchById(router, '/foo/foo')?.error).toBeUndefined()
      expect(loader).toHaveBeenCalledTimes(2)
    } finally {
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  test('same-url background beforeLoad context remains private until the atomic background commit', async () => {
    const initialData = { version: 'old' }
    const freshData = { version: 'new' }
    let contextVersion = 'old'
    let resolveParent!: (data: typeof freshData) => void
    let parentLoaderCalls = 0
    const parentLoader = vi.fn(() => {
      parentLoaderCalls += 1
      if (parentLoaderCalls === 1) {
        return initialData
      }

      return new Promise<typeof freshData>((resolve) => {
        resolveParent = resolve
      })
    })

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad: () => ({ version: contextVersion }),
      loader: parentLoader,
      staleTime: 0,
      gcTime: 60_000,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      head: ({ matches }) => {
        const parent = matches.find(
          (match: any) => match.routeId === parentRoute.id,
        )!
        return {
          meta: [
            {
              title: `${parent.context.version} / ${(parent.loaderData as any).version}`,
            },
          ],
        }
      },
      staleTime: Infinity,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/parent/child' })
    const parentMatchId = router.state.matches.find(
      (match) => match.routeId === parentRoute.id,
    )!.id
    const childMatchId = router.state.matches.find(
      (match) => match.routeId === childRoute.id,
    )!.id

    expect(getMatchById(router, parentMatchId)?.context).toMatchObject({
      version: 'old',
    })
    expect(getMatchById(router, parentMatchId)?.loaderData).toEqual(initialData)
    expect(getTitle(getMatchById(router, childMatchId))).toBe('old / old')

    const parentStore = router.stores.matchStores.get(parentMatchId)! as any
    const childStore = router.stores.matchStores.get(childMatchId)! as any
    const seen: Array<{
      contextVersion?: string
      loaderVersion?: string
      title?: string
    }> = []
    const capture = () => {
      const parent = getMatchById(router, parentMatchId)
      const child = getMatchById(router, childMatchId)
      seen.push({
        contextVersion: (parent?.context as any)?.version,
        loaderVersion: (parent?.loaderData as any)?.version,
        title: getTitle(child),
      })
    }
    const parentSubscription = parentStore.subscribe(capture)
    const childSubscription = childStore.subscribe(capture)

    contextVersion = 'new'
    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(2))

    expect(getMatchById(router, parentMatchId)?.context).toMatchObject({
      version: 'old',
    })
    expect(getMatchById(router, parentMatchId)?.loaderData).toEqual(initialData)
    expect(getTitle(getMatchById(router, childMatchId))).toBe('old / old')
    expect(getMatchById(router, parentMatchId)?.isFetching).toBe('loader')

    resolveParent(freshData)
    await vi.waitFor(() =>
      expect(getMatchById(router, parentMatchId)?.loaderData).toEqual(
        freshData,
      ),
    )

    expect(getMatchById(router, parentMatchId)?.context).toMatchObject({
      version: 'new',
    })
    expect(getTitle(getMatchById(router, childMatchId))).toBe('new / new')
    expect(
      seen.some(
        (snapshot) =>
          snapshot.contextVersion === 'new' && snapshot.title === 'old / old',
      ),
    ).toBe(false)
    expect(
      seen.some(
        (snapshot) =>
          snapshot.loaderVersion === 'new' && snapshot.title === 'old / old',
      ),
    ).toBe(false)

    parentSubscription?.unsubscribe?.()
    childSubscription?.unsubscribe?.()
  })

  test('pure same-url background revalidation does not perform a foreground commit', async () => {
    let resolveStaleReload!: (data: { value: string }) => void
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return { value: 'first' }
      }

      return new Promise<{ value: string }>((resolve) => {
        resolveStaleReload = resolve
      })
    })
    const onEnter = vi.fn()
    const onLeave = vi.fn()
    const onStay = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      staleTime: 0,
      gcTime: 60_000,
      onEnter,
      onLeave,
      onStay,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    const loadedAt = router.stores.loadedAt.get()
    const cachedIds = router.stores.cachedMatches.get().map((match) => match.id)
    onEnter.mockClear()
    onLeave.mockClear()
    onStay.mockClear()

    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))

    expect(router.stores.loadedAt.get()).toBe(loadedAt)
    expect(onEnter).not.toHaveBeenCalled()
    expect(onLeave).not.toHaveBeenCalled()
    expect(onStay).not.toHaveBeenCalled()
    expect(router.stores.cachedMatches.get().map((match) => match.id)).toEqual(
      cachedIds,
    )
    expect(getMatchById(router, '/foo/foo')?.isFetching).toBe('loader')

    resolveStaleReload({ value: 'second' })
    await vi.waitFor(() =>
      expect(getMatchById(router, '/foo/foo')?.loaderData).toEqual({
        value: 'second',
      }),
    )

    expect(router.stores.loadedAt.get()).toBe(loadedAt)
    expect(onEnter).not.toHaveBeenCalled()
    expect(onLeave).not.toHaveBeenCalled()
    expect(onStay).not.toHaveBeenCalled()
    expect(router.stores.cachedMatches.get().map((match) => match.id)).toEqual(
      cachedIds,
    )
  })

  test('blocking child reload and background parent reload commit coherent asset revisions', async () => {
    const initialParentData = { title: 'old-parent' }
    const freshParentData = { title: 'new-parent' }
    const initialChildData = { title: 'old-child' }
    const freshChildData = { title: 'new-child' }
    let resolveParent!: (data: typeof freshParentData) => void
    let parentLoaderCalls = 0
    let childLoaderCalls = 0
    const parentLoader = vi.fn(() => {
      parentLoaderCalls += 1
      if (parentLoaderCalls === 1) {
        return initialParentData
      }

      return new Promise<typeof freshParentData>((resolve) => {
        resolveParent = resolve
      })
    })
    const childLoader = vi.fn(() => {
      childLoaderCalls += 1
      return childLoaderCalls === 1 ? initialChildData : freshChildData
    })

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: parentLoader,
      staleTime: 0,
      gcTime: 60_000,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: {
        handler: childLoader,
        staleReloadMode: 'blocking',
      } satisfies LoaderEntry,
      head: ({ loaderData, matches }) => {
        const parent = matches.find(
          (match: any) => match.routeId === parentRoute.id,
        )!
        return {
          meta: [
            {
              title: `${(parent.loaderData as any).title} / ${(loaderData as any).title}`,
            },
          ],
        }
      },
      staleTime: 0,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/parent/child' })
    const parentMatchId = router.state.matches.find(
      (match) => match.routeId === parentRoute.id,
    )!.id
    const childMatchId = router.state.matches.find(
      (match) => match.routeId === childRoute.id,
    )!.id
    const childStore = router.stores.matchStores.get(childMatchId)! as any
    const seen: Array<{ loaderTitle?: string; metaTitle?: string }> = []
    const subscription = childStore.subscribe(() => {
      const child = getMatchById(router, childMatchId)
      seen.push({
        loaderTitle: (child?.loaderData as any)?.title,
        metaTitle: getTitle(child),
      })
    })

    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(2))
    expect(childLoader).toHaveBeenCalledTimes(2)

    expect(getMatchById(router, parentMatchId)?.loaderData).toEqual(
      initialParentData,
    )
    expect(getMatchById(router, childMatchId)?.loaderData).toEqual(
      freshChildData,
    )
    expect(getTitle(getMatchById(router, childMatchId))).toBe(
      'old-parent / new-child',
    )
    expect(getMatchById(router, parentMatchId)?.isFetching).toBe('loader')

    resolveParent(freshParentData)
    await vi.waitFor(() =>
      expect(getMatchById(router, parentMatchId)?.loaderData).toEqual(
        freshParentData,
      ),
    )

    expect(getMatchById(router, childMatchId)?.loaderData).toEqual(
      freshChildData,
    )
    expect(getTitle(getMatchById(router, childMatchId))).toBe(
      'new-parent / new-child',
    )
    expect(
      seen.some(
        (snapshot) =>
          snapshot.loaderTitle === 'new-child' &&
          !['old-parent / new-child', 'new-parent / new-child'].includes(
            snapshot.metaTitle ?? '',
          ),
      ),
    ).toBe(false)

    subscription?.unsubscribe?.()
  })

  test('same-url load with one background route and one pending route still performs a final foreground commit', async () => {
    const initialParentData = { title: 'old-parent' }
    const freshParentData = { title: 'new-parent' }
    const childResolvers: Array<(data: string) => void> = []
    let resolveParent!: (data: typeof freshParentData) => void
    let parentLoaderCalls = 0
    const parentLoader = vi.fn(() => {
      parentLoaderCalls += 1
      if (parentLoaderCalls === 1) {
        return initialParentData
      }

      return new Promise<typeof freshParentData>((resolve) => {
        resolveParent = resolve
      })
    })
    const childLoader = vi.fn(() => {
      if (childResolvers.length === 0) {
        childResolvers.push(() => {})
        return 'initial child'
      }

      return new Promise<string>((resolve) => {
        childResolvers.push(resolve)
      })
    })
    const childHead = vi.fn(({ loaderData }) => ({
      meta: [{ title: loaderData }],
    }))

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: parentLoader,
      staleTime: 0,
      gcTime: 60_000,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      pendingMs: 0,
      pendingComponent: () => null,
      loader: {
        handler: childLoader,
        staleReloadMode: 'blocking',
      } satisfies LoaderEntry,
      head: childHead,
      staleTime: 0,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    await router.load()
    const parentMatchId = router.state.matches.find(
      (match) => match.routeId === parentRoute.id,
    )!.id
    const childMatchId = router.state.matches.find(
      (match) => match.routeId === childRoute.id,
    )!.id
    router.updateMatch(parentMatchId, (match) => ({
      ...match,
      invalid: true,
    }))
    router.updateMatch(childMatchId, (match) => ({
      ...match,
      status: 'pending',
      isFetching: 'loader',
    }))

    const secondLoad = router.invalidate()
    await vi.waitFor(() => expect(childLoader).toHaveBeenCalledTimes(2))

    expect(router.state.isLoading).toBe(true)

    childResolvers[1]!('fresh child')
    await secondLoad

    const childMatch = router.state.matches.find(
      (match) => match.routeId === childRoute.id,
    )
    expect(childMatch?.status).toBe('success')
    expect(childMatch?.loaderData).toBe('fresh child')
    expect(getTitle(childMatch)).toBe('fresh child')
    expect(router.state.isLoading).toBe(false)

    await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(2))
    resolveParent(freshParentData)
    await vi.waitFor(() =>
      expect(
        router.state.matches.find((match) => match.routeId === parentRoute.id)
          ?.loaderData,
      ).toEqual(freshParentData),
    )
  })

  test('foreground final commit reprojects assets when only beforeLoad context changed', async () => {
    let titleVersion = 'old'
    const head = vi.fn(({ match }) => ({
      meta: [{ title: match.context.titleVersion }],
    }))
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      beforeLoad: () => ({ titleVersion }),
      head,
      staleTime: Infinity,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/target'] }),
    })

    await router.load()
    const targetMatchId = router.state.matches.find(
      (match) => match.routeId === targetRoute.id,
    )!.id
    const initialMatch = getMatchById(router, targetMatchId)!
    expect(getTitle(initialMatch)).toBe('old')
    head.mockClear()

    titleVersion = 'new'
    await router.load({ sync: true })

    const updatedMatch = getMatchById(router, targetMatchId)!
    expect(updatedMatch.id).toBe(initialMatch.id)
    expect(updatedMatch.loaderData).toBe(initialMatch.loaderData)
    expect(updatedMatch.status).toBe(initialMatch.status)
    expect(updatedMatch.error).toBe(initialMatch.error)
    expect(getTitle(updatedMatch)).toBe('new')
    expect(head).toHaveBeenCalledTimes(1)
  })

  test('stale cache-owned preload remains blocking', async () => {
    let resolveStalePreload!: (data: { title: string }) => void
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return { title: 'old preload' }
      }

      return new Promise<{ title: string }>((resolve) => {
        resolveStalePreload = resolve
      })
    })
    const seenLoaderData: Array<unknown> = []
    const head = vi.fn(({ loaderData }) => {
      seenLoaderData.push(loaderData)
      return { meta: [{ title: loaderData.title }] }
    })

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head,
      staleTime: 0,
      preloadStaleTime: 0,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.preloadRoute({ to: '/foo' })
    expect(loader).toHaveBeenCalledTimes(1)
    expect(head).toHaveBeenCalledTimes(1)
    expect(seenLoaderData).toEqual([{ title: 'old preload' }])

    head.mockClear()
    seenLoaderData.length = 0

    await vi.advanceTimersByTimeAsync(1)
    let preloadSettled = false
    const preload = router.preloadRoute({ to: '/foo' }).then((matches) => {
      preloadSettled = true
      return matches
    })

    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
    expect(preloadSettled).toBe(false)
    expect(head).not.toHaveBeenCalled()

    resolveStalePreload({ title: 'fresh preload' })
    const matches = await preload
    const match = matches?.find((item) => item.id === '/foo/foo')

    expect(preloadSettled).toBe(true)
    expect(match?.loaderData).toEqual({ title: 'fresh preload' })
    expect(head).toHaveBeenCalledTimes(1)
    expect(seenLoaderData).toEqual([{ title: 'fresh preload' }])
    expect(getMatchById(router, '/foo/foo')?._.loadPromise).toBeUndefined()
  })

  test('sync background stale reload executes head once after loader work', async () => {
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      return {
        title: loaderCalls === 1 ? 'First title' : 'Second title',
      }
    })
    const seenLoaderData: Array<unknown> = []
    const head = vi.fn(({ loaderData }) => {
      seenLoaderData.push(loaderData)
      return {
        meta: [{ title: loaderData.title }],
      }
    })

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head,
      staleTime: 0,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    expect(head).toHaveBeenCalledTimes(1)

    head.mockClear()
    seenLoaderData.length = 0

    await vi.advanceTimersByTimeAsync(1)
    await router.load()

    expect(loader).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(head).toHaveBeenCalledTimes(1))
    expect(head).toHaveBeenCalledTimes(1)
    expect(seenLoaderData).toEqual([{ title: 'Second title' }])

    await Promise.resolve()

    expect(head).toHaveBeenCalledTimes(1)
  })

  test('same-url load while async background reload is pending lets latest batch win', async () => {
    const resolvers: Array<(data: { title: string }) => void> = []
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return { title: 'First title' }
      }

      return new Promise<{ title: string }>((resolve) => {
        resolvers.push(resolve)
      })
    })
    const seenLoaderData: Array<unknown> = []
    const head = vi.fn(({ loaderData }) => {
      seenLoaderData.push(loaderData)
      return {
        meta: [{ title: loaderData.title }],
      }
    })

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head,
      staleTime: 0,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    head.mockClear()
    seenLoaderData.length = 0

    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))

    const firstBackground = router._backgroundLoad
    expect(firstBackground).toBeDefined()
    expect(getMatchById(router, '/foo/foo')?.isFetching).toBe('loader')
    expect(head).not.toHaveBeenCalled()

    await router.load()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(3))
    expect(router._backgroundLoad).toBeDefined()
    expect(router._backgroundLoad).not.toBe(firstBackground)
    expect(firstBackground?.controller.signal.aborted).toBe(true)
    expect(head).not.toHaveBeenCalled()

    resolvers[0]!({ title: 'Stale title' })
    await Promise.resolve()
    expect(head).not.toHaveBeenCalled()

    resolvers[1]!({ title: 'Second title' })
    await vi.waitFor(() => expect(head).toHaveBeenCalledTimes(1))

    expect(seenLoaderData).toEqual([{ title: 'Second title' }])
  })

  test('background batch that observed a pending navigation cannot later commit', async () => {
    const initialParentData = { title: 'initial parent' }
    const freshParentData = { title: 'fresh parent' }
    const initialChildData = { title: 'initial child' }
    const freshChildData = { title: 'fresh child' }
    let resolveChild!: (data: typeof freshChildData) => void
    let parentLoaderCalls = 0
    let childLoaderCalls = 0
    let router: RouterCore<any, any, any, any, any>
    let pendingNavigation: Promise<unknown> | undefined
    const parentHead = vi.fn(() => ({}))
    const childHead = vi.fn(() => ({}))

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: vi.fn(() => {
        parentLoaderCalls += 1
        if (parentLoaderCalls === 1) {
          return initialParentData
        }

        pendingNavigation = router.navigate({ to: '/bar' })
        return freshParentData
      }),
      head: parentHead,
      staleTime: 0,
      gcTime: 60_000,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: vi.fn(() => {
        childLoaderCalls += 1
        if (childLoaderCalls === 1) {
          return initialChildData
        }

        return new Promise<typeof freshChildData>((resolve) => {
          resolveChild = resolve
        })
      }),
      head: childHead,
      staleTime: 0,
      gcTime: 60_000,
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })

    const history = createMemoryHistory()

    router = createTestRouter({
      routeTree: rootRoute.addChildren([
        parentRoute.addChildren([childRoute]),
        barRoute,
      ]),
      history,
    })

    await router.navigate({ to: '/parent/child' })
    parentHead.mockClear()
    childHead.mockClear()
    // Pause auto-loading of the nested navigation so the background batch
    // observes the same public pending-location marker a user navigation sets.
    const unsubscribeHistory = history.subscribe(() => {})

    const baseMatches = router.state.matches
    const parentIndex = baseMatches.findIndex(
      (match) => match.routeId === parentRoute.id,
    )
    const childIndex = baseMatches.findIndex(
      (match) => match.routeId === childRoute.id,
    )

    startBackgroundLoad(router, router.state.location, baseMatches, [
      childIndex,
      parentIndex,
    ])

    await vi.waitFor(() => expect(parentLoaderCalls).toBe(2))
    const oldToken = router._backgroundLoad

    await vi.waitFor(() =>
      expect(oldToken?.controller.signal.aborted).toBe(true),
    )

    resolveChild(freshChildData)
    await Promise.resolve()
    await Promise.resolve()

    await vi.waitFor(() => expect(router._backgroundLoad).not.toBe(oldToken))
    expect(getMatchById(router, baseMatches[parentIndex]!.id)?.loaderData).toBe(
      initialParentData,
    )
    expect(getMatchById(router, baseMatches[childIndex]!.id)?.loaderData).toBe(
      initialChildData,
    )
    expect(getMatchById(router, baseMatches[parentIndex]!.id)?.isFetching).toBe(
      false,
    )
    expect(getMatchById(router, baseMatches[childIndex]!.id)?.isFetching).toBe(
      false,
    )
    expect(parentHead).not.toHaveBeenCalled()
    expect(childHead).not.toHaveBeenCalled()

    unsubscribeHistory()
    router.commitLocationPromise?.resolve()
    await pendingNavigation
  })

  test.each(['error', 'notFound'] as const)(
    'background index below a foreground %s boundary is discarded',
    async (outcome) => {
      const parentError = new Error('parent failed')
      let parentLoaderCalls = 0
      const parentLoader = vi.fn(() => {
        parentLoaderCalls += 1
        if (parentLoaderCalls === 1) {
          return { title: 'initial parent' }
        }

        throw outcome === 'error' ? parentError : notFound()
      })
      const childLoader = vi.fn(() => ({ title: 'initial child' }))

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: {
          handler: parentLoader,
          staleReloadMode: 'blocking',
        } satisfies LoaderEntry,
        errorComponent: () => null,
        notFoundComponent: () => null,
        staleTime: 0,
        gcTime: 60_000,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: childLoader,
        staleTime: 0,
        gcTime: 60_000,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      })

      await router.load()
      await vi.advanceTimersByTimeAsync(1)
      await router.load()
      await Promise.resolve()
      await Promise.resolve()

      expect(parentLoader).toHaveBeenCalledTimes(2)
      expect(childLoader).toHaveBeenCalledTimes(1)
      expect(router._backgroundLoad).toBeUndefined()
      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        parentRoute.id,
      ])
      expect(router.state.matches[1]?.status).toBe(outcome)
      if (outcome === 'error') {
        expect(router.state.matches[1]?.error).toBe(parentError)
      } else {
        expect(router.state.matches[1]?.error).toEqual(
          expect.objectContaining({ isNotFound: true }),
        )
      }
    },
  )

  test.each(['errorComponent', 'notFoundComponent'] as const)(
    'stale background %s preload rejection cancels the batch',
    async (componentType) => {
      const componentError = new Error('component failed')
      const componentGate = createControlledPromise<void>()
      const componentPreload = vi.fn(() => componentGate)
      let loaderCalls = 0
      const loader = vi.fn(() => {
        loaderCalls += 1
        if (loaderCalls === 1) {
          return { title: 'initial' }
        }

        if (componentType === 'errorComponent') {
          throw new Error('loader failed')
        }

        throw notFound()
      })

      const rootRoute = new BaseRootRoute({})
      const fooRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/foo',
        loader,
        staleTime: 0,
        gcTime: 60_000,
      })
      const barRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/bar',
      })
      const history = createMemoryHistory()
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([fooRoute, barRoute]),
        history,
      })

      await router.navigate({ to: '/foo' })
      fooRoute.options[componentType] = { preload: componentPreload } as any
      ;(fooRoute as any)._componentsLoaded = false
      const baseMatches = router.state.matches
      const fooIndex = baseMatches.findIndex(
        (match) => match.routeId === fooRoute.id,
      )
      expect(fooIndex).not.toBe(-1)
      startBackgroundLoad(router, router.state.location, baseMatches, [
        fooIndex,
      ])
      await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(componentPreload).toHaveBeenCalledTimes(1))

      const oldToken = router._backgroundLoad
      expect(oldToken).toBeDefined()
      const unsubscribeHistory = history.subscribe(() => {})

      componentGate.reject(componentError)
      const pendingNavigation = router.navigate({ to: '/bar' })

      await vi.waitFor(() =>
        expect(oldToken?.controller.signal.aborted).toBe(true),
      )

      unsubscribeHistory()
      router.commitLocationPromise?.resolve()
      await pendingNavigation
    },
  )

  test('successful background commit performs one active match publication', async () => {
    const initialData = { title: 'initial' }
    const freshData = { title: 'fresh' }
    let resolveFresh!: (data: typeof freshData) => void
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return initialData
      }

      return new Promise<typeof freshData>((resolve) => {
        resolveFresh = resolve
      })
    })

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      staleTime: 0,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    const matchId = router.state.matches.find(
      (match) => match.routeId === fooRoute.id,
    )!.id
    const matchStore = router.stores.matchStores.get(matchId)! as any
    const updates: Array<{
      isFetching: AnyRouteMatch['isFetching']
      title: string
    }> = []
    const subscription = matchStore.subscribe(() => {
      const match = getMatchById(router, matchId)!
      updates.push({
        isFetching: match.isFetching,
        title: (match.loaderData as typeof initialData).title,
      })
    })

    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
    resolveFresh(freshData)
    await vi.waitFor(() =>
      expect(getMatchById(router, matchId)?.loaderData).toBe(freshData),
    )
    subscription?.unsubscribe?.()

    expect(updates).toEqual([
      { isFetching: 'loader', title: 'initial' },
      { isFetching: false, title: 'fresh' },
    ])
  })

  test.each([
    ['parent', 'child'],
    ['child', 'parent'],
  ] as const)(
    'multiple async background loaders flush heads after %s then %s resolve',
    async (first, second) => {
      const freshParentData = { title: 'fresh parent' }
      const freshChildData = { title: 'fresh child' }
      let resolveParent!: (data: typeof freshParentData) => void
      let resolveChild!: (data: typeof freshChildData) => void
      let parentLoaderCalls = 0
      let childLoaderCalls = 0
      const parentLoader = vi.fn(() => {
        parentLoaderCalls += 1
        if (parentLoaderCalls === 1) {
          return { title: 'initial parent' }
        }
        return new Promise<typeof freshParentData>((resolve) => {
          resolveParent = resolve
        })
      })
      const childLoader = vi.fn(() => {
        childLoaderCalls += 1
        if (childLoaderCalls === 1) {
          return { title: 'initial child' }
        }
        return new Promise<typeof freshChildData>((resolve) => {
          resolveChild = resolve
        })
      })
      const parentSeenData: Array<unknown> = []
      const childSeenData: Array<unknown> = []
      const parentHead = vi.fn(({ loaderData }) => {
        parentSeenData.push(loaderData)
        return { meta: [{ title: loaderData.title }] }
      })
      const childHead = vi.fn(({ loaderData }) => {
        childSeenData.push(loaderData)
        return { meta: [{ title: loaderData.title }] }
      })

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: parentLoader,
        head: parentHead,
        staleTime: 0,
        gcTime: 60_000,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: childLoader,
        head: childHead,
        staleTime: 0,
        gcTime: 60_000,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory(),
      })

      await router.navigate({ to: '/parent/child' })
      const parentMatchId = router.state.matches.find(
        (match) => match.routeId === parentRoute.id,
      )!.id
      const childMatchId = router.state.matches.find(
        (match) => match.routeId === childRoute.id,
      )!.id
      parentHead.mockClear()
      childHead.mockClear()
      parentSeenData.length = 0
      childSeenData.length = 0

      await vi.advanceTimersByTimeAsync(1)
      await router.load()
      await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(childLoader).toHaveBeenCalledTimes(2))

      expect(getMatchById(router, parentMatchId)?.isFetching).toBe('loader')
      expect(getMatchById(router, childMatchId)?.isFetching).toBe('loader')
      expect(parentHead).not.toHaveBeenCalled()
      expect(childHead).not.toHaveBeenCalled()

      if (first === 'parent') {
        resolveParent(freshParentData)
      } else {
        resolveChild(freshChildData)
      }

      await Promise.resolve()
      expect(parentHead).not.toHaveBeenCalled()
      expect(childHead).not.toHaveBeenCalled()

      if (second === 'parent') {
        resolveParent(freshParentData)
      } else {
        resolveChild(freshChildData)
      }

      await vi.waitFor(() => expect(parentHead).toHaveBeenCalledTimes(1))
      expect(childHead).toHaveBeenCalledTimes(1)
      expect(parentSeenData).toEqual([freshParentData])
      expect(childSeenData).toEqual([freshChildData])
    },
  )

  test.each([
    ['parent', 'child'],
    ['child', 'parent'],
  ] as const)(
    'background child redirect waits for parent error and then wins when %s settles first',
    async (first, _second) => {
      const parentError = new Error('parent failed')
      let rejectParent!: (error: unknown) => void
      let rejectChild!: (error: unknown) => void
      let parentLoaderCalls = 0
      let childLoaderCalls = 0
      const parentLoader = vi.fn(() => {
        parentLoaderCalls += 1
        if (parentLoaderCalls === 1) {
          return { title: 'initial parent' }
        }
        return new Promise((_resolve, reject) => {
          rejectParent = reject
        })
      })
      const childLoader = vi.fn(() => {
        childLoaderCalls += 1
        if (childLoaderCalls === 1) {
          return { title: 'initial child' }
        }
        return new Promise((_resolve, reject) => {
          rejectChild = reject
        })
      })

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: parentLoader,
        staleTime: 0,
        gcTime: 60_000,
        errorComponent: () => null,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: childLoader,
        staleTime: 0,
        gcTime: 60_000,
      })
      const barRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/bar',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
          barRoute,
        ]),
        history: createMemoryHistory(),
      })

      await router.navigate({ to: '/parent/child' })
      await vi.advanceTimersByTimeAsync(1)
      await router.load()
      await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(childLoader).toHaveBeenCalledTimes(2))

      if (first === 'parent') {
        rejectParent(parentError)
      } else {
        rejectChild(redirect({ to: '/bar' }))
      }
      await Promise.resolve()
      expect(router.state.location.pathname).toBe('/parent/child')

      if (first === 'parent') {
        rejectChild(redirect({ to: '/bar' }))
      } else {
        rejectParent(parentError)
      }

      await vi.waitFor(() =>
        expect(router.state.location.pathname).toBe('/bar'),
      )
    },
  )

  test.each([
    ['parent', 'child'],
    ['child', 'parent'],
  ] as const)(
    'background parent error waits for child notFound and then wins when %s settles first',
    async (first, _second) => {
      const parentError = new Error('parent failed')
      let rejectParent!: (error: unknown) => void
      let rejectChild!: (error: unknown) => void
      let parentLoaderCalls = 0
      let childLoaderCalls = 0
      const parentLoader = vi.fn(() => {
        parentLoaderCalls += 1
        if (parentLoaderCalls === 1) {
          return { title: 'initial parent' }
        }
        return new Promise((_resolve, reject) => {
          rejectParent = reject
        })
      })
      const childLoader = vi.fn(() => {
        childLoaderCalls += 1
        if (childLoaderCalls === 1) {
          return { title: 'initial child' }
        }
        return new Promise((_resolve, reject) => {
          rejectChild = reject
        })
      })

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: parentLoader,
        staleTime: 0,
        gcTime: 60_000,
        errorComponent: () => null,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: childLoader,
        staleTime: 0,
        gcTime: 60_000,
        notFoundComponent: () => null,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory(),
      })

      await router.navigate({ to: '/parent/child' })
      const parentMatchId = router.state.matches.find(
        (match) => match.routeId === parentRoute.id,
      )!.id
      await vi.advanceTimersByTimeAsync(1)
      await router.load()
      await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(childLoader).toHaveBeenCalledTimes(2))

      if (first === 'parent') {
        rejectParent(parentError)
      } else {
        rejectChild(notFound())
      }
      await Promise.resolve()
      expect(getMatchById(router, parentMatchId)?.status).toBe('success')

      if (first === 'parent') {
        rejectChild(notFound())
      } else {
        rejectParent(parentError)
      }

      await vi.waitFor(() =>
        expect(getMatchById(router, parentMatchId)?.status).toBe('error'),
      )
      expect(getMatchById(router, parentMatchId)?.error).toBe(parentError)
    },
  )

  test.each([
    ['parent', 'child'],
    ['child', 'parent'],
  ] as const)(
    'background shallow regular error waits for deep regular error and then wins when %s settles first',
    async (first, _second) => {
      const parentError = new Error('parent failed')
      const childError = new Error('child failed')
      let rejectParent!: (error: unknown) => void
      let rejectChild!: (error: unknown) => void
      let parentLoaderCalls = 0
      let childLoaderCalls = 0
      const parentLoader = vi.fn(() => {
        parentLoaderCalls += 1
        if (parentLoaderCalls === 1) {
          return { title: 'initial parent' }
        }
        return new Promise((_resolve, reject) => {
          rejectParent = reject
        })
      })
      const childLoader = vi.fn(() => {
        childLoaderCalls += 1
        if (childLoaderCalls === 1) {
          return { title: 'initial child' }
        }
        return new Promise((_resolve, reject) => {
          rejectChild = reject
        })
      })

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: parentLoader,
        staleTime: 0,
        gcTime: 60_000,
        errorComponent: () => null,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: childLoader,
        staleTime: 0,
        gcTime: 60_000,
        errorComponent: () => null,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory(),
      })

      await router.navigate({ to: '/parent/child' })
      const parentMatchId = router.state.matches.find(
        (match) => match.routeId === parentRoute.id,
      )!.id
      const childMatchId = router.state.matches.find(
        (match) => match.routeId === childRoute.id,
      )!.id
      await vi.advanceTimersByTimeAsync(1)
      await router.load()
      await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(childLoader).toHaveBeenCalledTimes(2))

      if (first === 'parent') {
        rejectParent(parentError)
      } else {
        rejectChild(childError)
      }
      await Promise.resolve()
      expect(getMatchById(router, parentMatchId)?.status).toBe('success')
      expect(getMatchById(router, childMatchId)?.status).toBe('success')

      if (first === 'parent') {
        rejectChild(childError)
      } else {
        rejectParent(parentError)
      }

      await vi.waitFor(() =>
        expect(getMatchById(router, parentMatchId)?.status).toBe('error'),
      )
      expect(getMatchById(router, parentMatchId)?.error).toBe(parentError)
      expect(hasActiveMatch(router, childMatchId)).toBe(false)
    },
  )

  test('newer background batch supersedes older batch for the same lane', async () => {
    const initialParentData = { title: 'initial parent' }
    const initialChildData = { title: 'initial child' }
    const freshParentData = { title: 'fresh parent' }
    const freshChildData = { title: 'fresh child' }
    let reloadParent = false
    let reloadChild = false
    let resolveParent!: (data: typeof freshParentData) => void
    let resolveChild!: (data: typeof freshChildData) => void
    let parentLoaderCalls = 0
    let childLoaderCalls = 0
    const parentLoader = vi.fn(() => {
      parentLoaderCalls += 1
      if (parentLoaderCalls === 1) {
        return initialParentData
      }
      return new Promise<typeof freshParentData>((resolve) => {
        resolveParent = resolve
      })
    })
    const childLoader = vi.fn(() => {
      childLoaderCalls += 1
      if (childLoaderCalls === 1) {
        return initialChildData
      }
      return new Promise<typeof freshChildData>((resolve) => {
        resolveChild = resolve
      })
    })
    const childSeenData: Array<{
      loaderData: unknown
      parentLoaderData: unknown
    }> = []
    const parentHead = vi.fn(({ loaderData }) => ({
      meta: [{ title: loaderData.title }],
    }))
    const childHead = vi.fn(({ loaderData, matches }) => {
      childSeenData.push({
        loaderData,
        parentLoaderData: matches.find(
          (match: any) => match.routeId === parentRoute.id,
        )?.loaderData,
      })
      return { meta: [{ title: loaderData.title }] }
    })

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: parentLoader,
      head: parentHead,
      staleTime: Infinity,
      gcTime: 60_000,
      shouldReload: () => reloadParent,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: childLoader,
      head: childHead,
      staleTime: Infinity,
      gcTime: 60_000,
      shouldReload: () => reloadChild,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/parent/child' })
    const parentMatchId = router.state.matches.find(
      (match) => match.routeId === parentRoute.id,
    )!.id
    const childMatchId = router.state.matches.find(
      (match) => match.routeId === childRoute.id,
    )!.id
    parentHead.mockClear()
    childHead.mockClear()
    childSeenData.length = 0

    reloadParent = true
    reloadChild = false
    await router.load()
    await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(2))
    const firstBackground = router._backgroundLoad
    expect(getMatchById(router, parentMatchId)?.isFetching).toBe('loader')

    reloadParent = false
    reloadChild = true
    await router.load()
    await vi.waitFor(() => expect(childLoader).toHaveBeenCalledTimes(2))
    expect(router._backgroundLoad).toBeDefined()
    expect(router._backgroundLoad).not.toBe(firstBackground)
    expect(firstBackground?.controller.signal.aborted).toBe(true)
    expect(getMatchById(router, parentMatchId)?.isFetching).toBe(false)
    expect(getMatchById(router, childMatchId)?.isFetching).toBe('loader')
    expect(parentHead).not.toHaveBeenCalled()
    expect(childHead).not.toHaveBeenCalled()

    resolveParent(freshParentData)
    await Promise.resolve()
    expect(getMatchById(router, parentMatchId)?.loaderData).toEqual(
      initialParentData,
    )
    expect(parentHead).not.toHaveBeenCalled()
    expect(childHead).not.toHaveBeenCalled()

    resolveChild(freshChildData)
    await vi.waitFor(() => expect(childHead).toHaveBeenCalledTimes(1))

    expect(getMatchById(router, parentMatchId)?.loaderData).toEqual(
      initialParentData,
    )
    expect(childSeenData).toEqual([
      {
        loaderData: freshChildData,
        parentLoaderData: initialParentData,
      },
    ])
    expect(router.state.matches.every((match) => !match.isFetching)).toBe(true)
  })

  test('latest same-url pass owns the deferred head boundary', async () => {
    const freshParentData = { title: 'fresh parent' }
    let reloadParent = false
    let childNotFound = false
    let parentLoaderCalls = 0
    let resolveParent!: (data: typeof freshParentData) => void
    const parentLoader = vi.fn(() => {
      parentLoaderCalls += 1
      if (parentLoaderCalls === 1) {
        return { title: 'initial parent' }
      }
      return new Promise<typeof freshParentData>((resolve) => {
        resolveParent = resolve
      })
    })
    const childLoader = vi.fn(() => ({ title: 'initial child' }))
    const parentHead = vi.fn(({ loaderData }) => ({
      meta: [{ title: loaderData.title }],
    }))
    const childHead = vi.fn(({ loaderData }) => ({
      meta: [{ title: loaderData.title }],
    }))

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: parentLoader,
      head: parentHead,
      staleTime: Infinity,
      gcTime: 60_000,
      shouldReload: () => reloadParent,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      beforeLoad: () => {
        if (childNotFound) {
          throw notFound({ routeId: parentRoute.id })
        }
      },
      loader: childLoader,
      head: childHead,
      staleTime: Infinity,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/parent/child' })
    const parentMatchId = router.state.matches.find(
      (match) => match.routeId === parentRoute.id,
    )!.id
    parentHead.mockClear()
    childHead.mockClear()

    reloadParent = true
    await router.load()
    await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(2))
    expect(getMatchById(router, parentMatchId)?.isFetching).toBe('loader')

    reloadParent = false
    childNotFound = true
    await router.load()
    expect(parentHead).toHaveBeenCalledTimes(1)
    expect(childHead).not.toHaveBeenCalled()

    resolveParent(freshParentData)
    await Promise.resolve()

    expect(parentHead).toHaveBeenCalledTimes(1)
    expect(childHead).not.toHaveBeenCalled()
    expect(
      router.state.matches.some(
        (match) =>
          match.status === 'notFound' &&
          (match.error as { routeId?: string } | undefined)?.routeId ===
            parentRoute.id,
      ),
    ).toBe(true)
  })

  test.each([
    ['error', 'success'],
    ['success', 'error'],
  ] as const)(
    'successful background completion does not flush heads after another background match failed: %s then %s',
    async (first, second) => {
      void second
      const parentError = new Error('parent failed')
      const freshChildData = { title: 'fresh child' }
      let rejectParent!: (error: unknown) => void
      let resolveChild!: (data: typeof freshChildData) => void
      let parentLoaderCalls = 0
      let childLoaderCalls = 0
      const parentLoader = vi.fn(() => {
        parentLoaderCalls += 1
        if (parentLoaderCalls === 1) {
          return { title: 'initial parent' }
        }
        return new Promise((_resolve, reject) => {
          rejectParent = reject
        })
      })
      const childLoader = vi.fn(() => {
        childLoaderCalls += 1
        if (childLoaderCalls === 1) {
          return { title: 'initial child' }
        }
        return new Promise<typeof freshChildData>((resolve) => {
          resolveChild = resolve
        })
      })
      const parentHead = vi.fn(({ loaderData }) => ({
        meta: [{ title: loaderData.title }],
      }))
      const childHead = vi.fn(({ loaderData }) => ({
        meta: [{ title: loaderData.title }],
      }))

      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: parentLoader,
        head: parentHead,
        staleTime: 0,
        gcTime: 60_000,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: childLoader,
        head: childHead,
        staleTime: 0,
        gcTime: 60_000,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory(),
      })

      await router.navigate({ to: '/parent/child' })
      const parentMatchId = router.state.matches.find(
        (match) => match.routeId === parentRoute.id,
      )!.id
      const childMatchId = router.state.matches.find(
        (match) => match.routeId === childRoute.id,
      )!.id
      parentHead.mockClear()
      childHead.mockClear()

      await vi.advanceTimersByTimeAsync(1)
      await router.load()
      await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(childLoader).toHaveBeenCalledTimes(2))

      expect(getMatchById(router, parentMatchId)?.isFetching).toBe('loader')
      expect(getMatchById(router, childMatchId)?.isFetching).toBe('loader')

      if (first === 'error') {
        rejectParent(parentError)
        resolveChild(freshChildData)
      } else {
        resolveChild(freshChildData)
        rejectParent(parentError)
      }

      await vi.waitFor(() =>
        expect(getMatchById(router, parentMatchId)?.status).toBe('error'),
      )
      expect(parentHead).toHaveBeenCalledTimes(1)
      expect(childHead).not.toHaveBeenCalled()
    },
  )

  test('synchronous background loader error waits for the error component before executing boundary head', async () => {
    const loaderError = new Error('sync background failed')
    const errorGate = createControlledPromise<void>()
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return { title: 'initial' }
      }
      throw loaderError
    })
    const head = vi.fn(({ loaderData, match }) => ({
      meta: [{ title: match.error ? 'error' : loaderData.title }],
    }))
    const errorPreload = vi.fn(() => errorGate)

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head,
      staleTime: 0,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    fooRoute.options.errorComponent = { preload: errorPreload } as any
    ;(fooRoute as any)._componentsLoaded = false
    head.mockClear()

    await vi.advanceTimersByTimeAsync(1)
    await router.load()

    expect(loader).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(errorPreload).toHaveBeenCalledTimes(1))
    expect(getMatchById(router, '/foo/foo')?.isFetching).toBe('loader')
    expect(head).not.toHaveBeenCalled()

    errorGate.resolve()

    await vi.waitFor(() =>
      expect(getMatchById(router, '/foo/foo')?.status).toBe('error'),
    )
    expect(head).toHaveBeenCalledTimes(1)
    expect(getMatchById(router, '/foo/foo')?.meta).toEqual([{ title: 'error' }])
  })

  test('synchronous background loader redirect does not execute source head', async () => {
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return { title: 'initial' }
      }
      throw redirect({ to: '/bar' })
    })
    const head = vi.fn(({ loaderData }) => ({
      meta: [{ title: loaderData.title }],
    }))

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head,
      staleTime: 0,
      gcTime: 60_000,
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute, barRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    head.mockClear()

    await vi.advanceTimersByTimeAsync(1)
    await router.load()

    expect(loader).toHaveBeenCalledTimes(2)
    expect(head).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/bar'))
    expect(head).not.toHaveBeenCalled()
  })

  test('synchronous background loader notFound executes the selected boundary head', async () => {
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return { title: 'initial' }
      }
      throw notFound()
    })
    const head = vi.fn(({ loaderData, match }) => ({
      meta: [{ title: match.error ? 'not-found' : loaderData.title }],
    }))

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head,
      staleTime: 0,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    head.mockClear()

    await vi.advanceTimersByTimeAsync(1)
    await router.load()

    expect(loader).toHaveBeenCalledTimes(2)
    expect(head).not.toHaveBeenCalled()

    await vi.waitFor(() =>
      expect(getMatchById(router, '/foo/foo')?.status).toBe('notFound'),
    )
    expect(head).toHaveBeenCalledTimes(1)
    expect(getMatchById(router, '/foo/foo')?.meta).toEqual([
      { title: 'not-found' },
    ])
  })

  test('sync stale loader commits fresh data without reloading route chunk', async () => {
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      return { title: loaderCalls === 1 ? 'initial' : 'fresh' }
    })
    const lazyHead = vi.fn(({ loaderData }) => ({
      meta: [{ title: loaderData.title }],
    }))
    const lazyGate = createControlledPromise<any>()
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      staleTime: 0,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    const lazyFn = vi.fn(() => lazyGate)
    ;(fooRoute as any)._lazyLoaded = false
    ;(fooRoute as any).lazyFn = lazyFn

    await vi.advanceTimersByTimeAsync(1)
    await router.load()

    expect(loader).toHaveBeenCalledTimes(2)
    expect(lazyFn).not.toHaveBeenCalled()
    expect(lazyHead).not.toHaveBeenCalled()
    expect(getMatchById(router, '/foo/foo')?.isFetching).toBe(false)
    expect(getMatchById(router, '/foo/foo')?.loaderData).toEqual({
      title: 'fresh',
    })

    lazyGate.resolve({ options: { head: lazyHead } })
    await Promise.resolve()
    expect(lazyFn).not.toHaveBeenCalled()
    expect(lazyHead).not.toHaveBeenCalled()
    expect(getMatchById(router, '/foo/foo')?.loaderData).toEqual({
      title: 'fresh',
    })
  })

  test('background reload resolving after route exit does not execute head', async () => {
    let resolveStaleReload!: (data: { title: string }) => void
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return { title: 'initial' }
      }
      return new Promise<{ title: string }>((resolve) => {
        resolveStaleReload = resolve
      })
    })
    const head = vi.fn(() => ({ meta: [{ title: 'foo' }] }))
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head,
      staleTime: 0,
      gcTime: 60_000,
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute, barRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    head.mockClear()

    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
    expect(getMatchById(router, '/foo/foo')?.isFetching).toBe('loader')

    await router.navigate({ to: '/bar' })
    resolveStaleReload({ title: 'fresh' })
    await Promise.resolve()

    expect(router.state.location.pathname).toBe('/bar')
    expect(head).not.toHaveBeenCalled()
  })

  test('foreground navigation clears an active background fetching marker before commit', async () => {
    let resolveStaleReload!: (data: { title: string }) => void
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return { title: 'initial' }
      }
      return new Promise<{ title: string }>((resolve) => {
        resolveStaleReload = resolve
      })
    })
    const barBeforeLoadGate = createControlledPromise<void>()
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      staleTime: 0,
      gcTime: 60_000,
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
      beforeLoad: () => barBeforeLoadGate,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute, barRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
    expect(getMatchById(router, '/foo/foo')?.isFetching).toBe('loader')

    const barNavigation = router.navigate({ to: '/bar' })
    await vi.waitFor(() =>
      expect(router.stores.pendingIds.get()).toContain('/bar/bar'),
    )

    expect(getMatchById(router, '/foo/foo')?.isFetching).toBe(false)

    resolveStaleReload({ title: 'fresh' })
    barBeforeLoadGate.resolve()
    await barNavigation
    expect(router.state.location.pathname).toBe('/bar')
  })

  test('background reload redirect does not execute deferred source head', async () => {
    let rejectStaleReload!: (error: unknown) => void
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return { title: 'initial' }
      }
      return new Promise((_resolve, reject) => {
        rejectStaleReload = reject
      })
    })
    const head = vi.fn(() => ({ meta: [{ title: 'foo' }] }))
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head,
      staleTime: 0,
      gcTime: 60_000,
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute, barRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    head.mockClear()
    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
    expect(getMatchById(router, '/foo/foo')?.isFetching).toBe('loader')

    rejectStaleReload(redirect({ to: '/bar' }))
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/bar'))

    expect(head).not.toHaveBeenCalled()
  })

  test('background reload error does not execute success head with stale data', async () => {
    let rejectStaleReload!: (error: unknown) => void
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return { title: 'initial' }
      }
      return new Promise((_resolve, reject) => {
        rejectStaleReload = reject
      })
    })
    const head = vi.fn(({ match }) => ({
      meta: [{ title: match.error ? 'error' : 'foo' }],
    }))
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head,
      staleTime: 0,
      gcTime: 60_000,
      errorComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    head.mockClear()
    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
    expect(getMatchById(router, '/foo/foo')?.isFetching).toBe('loader')

    rejectStaleReload(new Error('background failed'))
    await vi.waitFor(() =>
      expect(getMatchById(router, '/foo/foo')?.status).toBe('error'),
    )

    expect(head).toHaveBeenCalledTimes(1)
    expect(getMatchById(router, '/foo/foo')?.meta).toEqual([{ title: 'error' }])
  })

  test('background-atomicity keeps active data and head coherent until atomic commit', async () => {
    let resolveStaleReload!: (value: { value: string }) => void
    let resolveHead!: () => void
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return { value: 'old' }
      }

      return new Promise<{ value: string }>((resolve) => {
        resolveStaleReload = resolve
      })
    })
    const head = vi.fn(({ loaderData }: { loaderData?: any }) => {
      if (loaderData?.value === 'new') {
        return new Promise<{ meta: Array<{ title: string }> }>((resolve) => {
          resolveHead = () => resolve({ meta: [{ title: 'new' }] })
        })
      }

      return { meta: [{ title: 'old' }] }
    })
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head,
      staleTime: 0,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    expect(getMatchById(router, '/foo/foo')?.loaderData).toEqual({
      value: 'old',
    })
    const initialMeta = getMatchById(router, '/foo/foo')?.meta
    head.mockClear()

    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))

    expect(getMatchById(router, '/foo/foo')?.isFetching).toBe('loader')

    resolveStaleReload({ value: 'new' })
    await vi.waitFor(() => expect(resolveHead).toBeTypeOf('function'))

    const activeWhileHeadPending = getMatchById(router, '/foo/foo')!
    expect(activeWhileHeadPending.loaderData).toEqual({ value: 'old' })
    expect(activeWhileHeadPending.meta).toBe(initialMeta)
    expect(activeWhileHeadPending.isFetching).toBe('loader')

    resolveHead()
    await vi.waitFor(() =>
      expect(getMatchById(router, '/foo/foo')?.loaderData).toEqual({
        value: 'new',
      }),
    )
    expect(getMatchById(router, '/foo/foo')?.meta).toEqual([{ title: 'new' }])
    expect(getMatchById(router, '/foo/foo')?.isFetching).toBe(false)
  })

  test('parent-only background reload republishes child head derived from parent loaderData', async () => {
    const freshParentData = { title: 'fresh parent' }
    let reloadParent = false
    let resolveParent!: (data: typeof freshParentData) => void
    let parentLoaderCalls = 0
    const parentLoader = vi.fn(() => {
      parentLoaderCalls += 1
      if (parentLoaderCalls === 1) {
        return { title: 'initial parent' }
      }
      return new Promise<typeof freshParentData>((resolve) => {
        resolveParent = resolve
      })
    })
    const childHead = vi.fn(({ matches }) => {
      const parent = matches.find(
        (match: any) => match.routeId === parentRoute.id,
      )
      return { meta: [{ title: parent?.loaderData.title }] }
    })

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: parentLoader,
      staleTime: Infinity,
      gcTime: 60_000,
      shouldReload: () => reloadParent,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      head: childHead,
      staleTime: Infinity,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/parent/child' })
    const childMatchId = router.state.matches.find(
      (match) => match.routeId === childRoute.id,
    )!.id
    const childStore = router.stores.matchStores.get(childMatchId)! as any
    const seen: Array<unknown> = []
    const subscription = childStore.subscribe(() => {
      seen.push(childStore.get().meta)
    })
    childHead.mockClear()

    reloadParent = true
    await router.load()
    await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(2))
    expect(childHead).not.toHaveBeenCalled()

    resolveParent(freshParentData)
    await vi.waitFor(() =>
      expect(getMatchById(router, childMatchId)?.meta).toEqual([
        { title: freshParentData.title },
      ]),
    )

    expect(childHead).toHaveBeenCalledTimes(1)
    expect(seen).toContainEqual([{ title: freshParentData.title }])
    subscription?.unsubscribe?.()
  })

  test('blocks stale reloads when loader staleReloadMode is blocking', async () => {
    const { loader, resolveStaleReload } = createControlledStaleReload()
    const router = setup({
      staleTime: 0,
      loader: {
        handler: loader,
        staleReloadMode: 'blocking',
      } satisfies LoaderEntry,
    })

    await expectBlockingStaleReloadBehavior(router, loader, resolveStaleReload)
  })

  test('blocks stale reloads when defaultStaleReloadMode is blocking', async () => {
    const { loader, resolveStaleReload } = createControlledStaleReload()
    const router = setup({
      loader,
      staleTime: 0,
      defaultStaleReloadMode: 'blocking',
    })

    await expectBlockingStaleReloadBehavior(router, loader, resolveStaleReload)
  })

  test('loader staleReloadMode overrides defaultStaleReloadMode', async () => {
    const { loader, resolveStaleReload } = createControlledStaleReload()
    const router = setup({
      staleTime: 0,
      defaultStaleReloadMode: 'blocking',
      loader: {
        handler: loader,
        staleReloadMode: 'background',
      } satisfies LoaderEntry,
    })

    await expectBackgroundStaleReloadBehavior(
      router,
      loader,
      resolveStaleReload,
    )
  })

  test('active background reload redirect navigates while its location is still current', async () => {
    let rejectStaleReload!: (error: unknown) => void
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return { value: 'first' }
      }

      return new Promise((_resolve, reject) => {
        rejectStaleReload = reject
      })
    })
    const router = setup({ loader, staleTime: 0 })

    await router.navigate({ to: '/foo' })
    expect(loader).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))

    expect(getMatchById(router, '/foo/foo')?.isFetching).toBe('loader')

    rejectStaleReload(redirect({ to: '/bar' }))
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/bar'))

    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.id === '/foo/foo'),
    ).toBe(true)
  })

  test('current background redirect bypasses navigation blockers and does not leave the source fetching', async () => {
    let rejectStaleReload!: (error: unknown) => void
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return { value: 'first' }
      }

      return new Promise((_resolve, reject) => {
        rejectStaleReload = reject
      })
    })
    const blockerFn = vi.fn(() => true)
    const router = setup({ loader, staleTime: 0 })
    let unblock: (() => void) | undefined

    try {
      await router.navigate({ to: '/foo' })
      expect(loader).toHaveBeenCalledTimes(1)
      unblock = router.history.block({
        blockerFn,
        enableBeforeUnload: false,
      })

      await vi.advanceTimersByTimeAsync(1)
      await router.load()
      await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))

      expect(getMatchById(router, '/foo/foo')?.isFetching).toBe('loader')

      rejectStaleReload(redirect({ to: '/bar' }))
      await vi.waitFor(() =>
        expect(router.state.location.pathname).toBe('/bar'),
      )

      expect(blockerFn).not.toHaveBeenCalled()
      const sourceMatch =
        router.state.matches.find((match) => match.id === '/foo/foo') ??
        router.stores.cachedMatches
          .get()
          .find((match) => match.id === '/foo/foo')
      expect(sourceMatch?.isFetching).not.toBe('loader')
    } finally {
      unblock?.()
    }
  })

  test('exited background reload redirect is ignored without evicting the source entry', async () => {
    let rejectStaleReload!: (error: unknown) => void
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return { value: 'first' }
      }

      return new Promise((_resolve, reject) => {
        rejectStaleReload = reject
      })
    })
    const router = setup({ loader, staleTime: 0 })

    await router.navigate({ to: '/foo' })
    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))

    expect(getMatchById(router, '/foo/foo')?.isFetching).toBe('loader')

    await router.navigate({ to: '/bar' })
    expect(router.state.location.pathname).toBe('/bar')
    const sourceLoadPromise = getMatchById(router, '/foo/foo')?._.loadPromise
    expect(sourceLoadPromise?.status).not.toBe('pending')
    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.id === '/foo/foo'),
    ).toBe(true)
    expect(
      router.stores.cachedMatches.get().find((match) => match.id === '/foo/foo')
        ?._.loadPromise,
    ).toBeUndefined()
    expectNoCachedActiveOverlap(router)

    rejectStaleReload(redirect({ to: '/baz' }))

    expect(router.state.location.pathname).toBe('/bar')
    await vi.waitFor(() =>
      expect(
        router.stores.cachedMatches
          .get()
          .some((match) => match.id === '/foo/foo'),
      ).toBe(true),
    )
    expectNoCachedActiveOverlap(router)
  })

  test('background redirect is ignored while a newer navigation is pending, even though the old source match is still active', async () => {
    let rejectStaleReload!: (error: unknown) => void
    let loaderCalls = 0
    const fooLoader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return { value: 'first' }
      }

      return new Promise((_resolve, reject) => {
        rejectStaleReload = reject
      })
    })
    const barBeforeLoadGate = createControlledPromise<void>()
    const barBeforeLoad = vi.fn(() => barBeforeLoadGate)
    const bazBeforeLoad = vi.fn()

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader: fooLoader,
      staleTime: 0,
      gcTime: 60_000,
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
      beforeLoad: barBeforeLoad,
    })
    const bazRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/baz',
      beforeLoad: bazBeforeLoad,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute, barRoute, bazRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await vi.waitFor(() => expect(fooLoader).toHaveBeenCalledTimes(2))

    expect(getMatchById(router, '/foo/foo')?.isFetching).toBe('loader')

    const barNavigation = router.navigate({ to: '/bar' })
    await vi.waitFor(() => expect(barBeforeLoad).toHaveBeenCalledTimes(1))
    expect(hasActiveMatch(router, '/foo/foo')).toBe(true)
    expect(hasPendingMatch(router, '/bar/bar')).toBe(true)

    rejectStaleReload(redirect({ to: '/baz' }))
    await Promise.resolve()

    expect(bazBeforeLoad).not.toHaveBeenCalled()

    barBeforeLoadGate.resolve()
    await barNavigation

    expect(router.state.location.pathname).toBe('/bar')
    expect(bazBeforeLoad).not.toHaveBeenCalled()
    expectNoCachedActiveOverlap(router)
  })

  test('soft background AbortError preserves data and updatedAt and clears fetching', async () => {
    let rejectStaleReload!: (error: unknown) => void
    let loaderCalls = 0
    const loader = vi.fn(() => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return { value: 'old' }
      }

      return new Promise((_resolve, reject) => {
        rejectStaleReload = reject
      })
    })
    const head = vi.fn(({ loaderData }) => ({
      meta: [{ title: loaderData.value }],
    }))
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head,
      staleTime: 0,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    const initialMatch = getMatchById(router, '/foo/foo')!
    const initialUpdatedAt = initialMatch.updatedAt
    expect(initialMatch.loaderData).toEqual({ value: 'old' })
    expect(getTitle(initialMatch)).toBe('old')
    head.mockClear()

    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))

    expect(getMatchById(router, '/foo/foo')?.isFetching).toBe('loader')

    const abortError = new Error('soft aborted')
    abortError.name = 'AbortError'
    rejectStaleReload(abortError)

    await vi.waitFor(() =>
      expect(getMatchById(router, '/foo/foo')?.isFetching).toBe(false),
    )

    const currentMatch = getMatchById(router, '/foo/foo')!
    expect(currentMatch.loaderData).toEqual({ value: 'old' })
    expect(currentMatch.updatedAt).toBe(initialUpdatedAt)
    expect(getTitle(currentMatch)).toBe('old')
    expect(head).toHaveBeenCalledTimes(1)
  })

  test('pending preload error leaves no cache entry', async () => {
    let rejectPreload!: (error: unknown) => void
    const loader = vi.fn(() => {
      return new Promise((_resolve, reject) => {
        rejectPreload = reject
      })
    })
    const router = setup({ loader })

    const preload = router.preloadRoute({ to: '/foo' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

    expect(getMatchById(router, '/foo/foo')).toBeUndefined()
    expect(router.stores.cachedMatches.get()).toEqual([])

    rejectPreload(new Error('preload failed'))
    await preload

    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.id === '/foo/foo'),
    ).toBe(false)
  })
})

test('cancelMatches after pending timeout', async () => {
  const WAIT_TIME = 5
  const onAbortMock = vi.fn()
  const rootRoute = new BaseRootRoute({})
  const fooRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/foo',
    pendingMs: WAIT_TIME * 20,
    loader: async ({ abortController }) => {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          resolve()
        }, WAIT_TIME * 40)
        abortController.signal.addEventListener('abort', () => {
          onAbortMock()
          clearTimeout(timer)
          resolve()
        })
      })
    },
    pendingComponent: {},
  })
  const barRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/bar',
  })
  const routeTree = rootRoute.addChildren([fooRoute, barRoute])
  const router = createTestRouter({ routeTree, history: createMemoryHistory() })

  await router.load()
  router.navigate({ to: '/foo' })
  await sleep(WAIT_TIME * 30)

  // At this point, pending timeout should have triggered
  const fooMatch = router.getMatch('/foo/foo')
  expect(fooMatch).toBeDefined()

  // Navigate away, which should cancel the pending match
  await router.navigate({ to: '/bar' })
  await router.latestLoadPromise

  expect(router.state.location.pathname).toBe('/bar')

  // Verify that abort was called and no stale pending route remains active.
  expect(onAbortMock).toHaveBeenCalled()
  const cancelledFooMatch = router.getMatch('/foo/foo')
  expect(cancelledFooMatch?.status).not.toBe('pending')
})

test('pending timeout stays scoped to the current load pass', async () => {
  vi.useFakeTimers()

  try {
    const WAIT_TIME = 5
    let resolveLoader!: () => void
    const loader = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLoader = resolve
        }),
    )

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      pendingMs: WAIT_TIME,
      loader,
      pendingComponent: {},
    })
    const routeTree = rootRoute.addChildren([fooRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.load()
    const navigation = router.navigate({ to: '/foo' })
    await vi.advanceTimersByTimeAsync(WAIT_TIME * 2)

    const firstPendingMatch = router.getMatch('/foo/foo')
    expect(firstPendingMatch?.status).toBe('pending')

    const joinedLoad = router.load()
    await Promise.resolve()

    const rearmedMatch = router.getMatch('/foo/foo')
    expect(rearmedMatch?.status).toBe('pending')

    await vi.advanceTimersByTimeAsync(WAIT_TIME * 2)
    expect(rearmedMatch?.status).toBe('pending')

    resolveLoader()
    await Promise.all([navigation, joinedLoad])
    expect(loader).toHaveBeenCalledTimes(2)
  } finally {
    vi.useRealTimers()
  }
})

test('pendingMin wait does not throw after its match is canceled', async () => {
  vi.useFakeTimers()

  try {
    let resolveLoader!: () => void
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      pendingMs: 0,
      pendingMinMs: 100,
      pendingComponent: () => null,
      loader: () =>
        new Promise<void>((resolve) => {
          resolveLoader = resolve
        }),
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/target'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)
    const targetMatch = matches.find(
      (match) => match.routeId === targetRoute.id,
    )!

    const loadPromise = loadMatches({
      router,
      location,
      matches,
      onReady: (readyMatches) => {
        const readyMatch = readyMatches.find(
          (match) => match.routeId === targetRoute.id,
        )!
        const promise = readyMatch._.loadPromise
        if (promise) {
          promise.pendingUntil ??= Date.now() + 100
        }
      },
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(router.getMatch(targetMatch.id)?.status).toBe('pending')

    resolveLoader()
    await Promise.resolve()
    router.cancelMatches()

    await vi.advanceTimersByTimeAsync(100)
    await expect(loadPromise).resolves.toBe(matches)
  } finally {
    vi.useRealTimers()
  }
})

test('cancelMatches settles pending match load promises immediately', async () => {
  let resolveLoader!: () => void
  const rootRoute = new BaseRootRoute({})
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    loader: () =>
      new Promise<void>((resolve) => {
        resolveLoader = resolve
      }),
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/target'] }),
  })
  const location = router.latestLocation
  const matches = router.matchRoutes(location)
  router.stores.setPending(matches)
  const targetMatch = matches.find((match) => match.routeId === targetRoute.id)!

  const loadPromise = loadMatches({ router, location, matches })
  await vi.waitFor(() =>
    expect(router.getMatch(targetMatch.id)?._.loadPromise).toBeDefined(),
  )

  const matchLoadPromise = router.getMatch(targetMatch.id)?._.loadPromise
  expect(matchLoadPromise?.status).toBe('pending')

  router.cancelMatches()

  expect(matchLoadPromise?.status).toBe('resolved')

  resolveLoader()
  await expect(loadPromise).resolves.toBe(matches)
})

test('settles load promise for pending-visible match that redirects after exiting', async () => {
  vi.useFakeTimers()

  try {
    let rejectLoader!: (error: unknown) => void
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const fromRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/from',
      pendingMs: 1,
      pendingComponent: {},
      loader: () =>
        new Promise((_resolve, reject) => {
          rejectLoader = reject
        }),
    })
    const toRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/to',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, fromRoute, toRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const navigation = router.navigate({ to: '/from' })
    await vi.waitFor(() => expect(router.state.status).toBe('pending'))
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() =>
      expect(
        router.state.matches.some(
          (match) => match.id === '/from/from' && match.status === 'pending',
        ),
      ).toBe(true),
    )

    const fromMatch = router.state.matches.find(
      (match) => match.id === '/from/from',
    )!
    const loadPromise = fromMatch._.loadPromise

    expect(loadPromise?.status).toBe('pending')

    rejectLoader(redirect({ to: '/to' }))
    await navigation

    expect(router.state.location.pathname).toBe('/to')
    expect(loadPromise?.status).toBe('resolved')
    expect(fromMatch._.loadPromise).toBeUndefined()
    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.id === '/from/from'),
    ).toBe(false)
  } finally {
    vi.useRealTimers()
  }
})

test('ignores late loader resolution after pending-visible match exits', async () => {
  vi.useFakeTimers()

  try {
    let resolveLoader!: () => void
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const fromRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/from',
      pendingMs: 1,
      pendingComponent: {},
      loader: () =>
        new Promise<void>((resolve) => {
          resolveLoader = resolve
        }),
    })
    const toRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/to',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, fromRoute, toRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const fromNavigation = router.navigate({ to: '/from' })
    await vi.waitFor(() => expect(router.state.status).toBe('pending'))
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() =>
      expect(
        router.state.matches.some(
          (match) => match.id === '/from/from' && match.status === 'pending',
        ),
      ).toBe(true),
    )

    const fromMatch = router.state.matches.find(
      (match) => match.id === '/from/from',
    )!
    const loadPromise = fromMatch._.loadPromise
    loadPromise!.pendingUntil = Date.now() + 100

    expect(loadPromise?.status).toBe('pending')

    await router.navigate({ to: '/to' })

    expect(router.state.location.pathname).toBe('/to')
    expect(loadPromise?.status).toBe('resolved')
    expect(fromMatch._.loadPromise).toBeUndefined()

    resolveLoader()
    await fromNavigation

    expect(router.state.location.pathname).toBe('/to')
    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.id === '/from/from'),
    ).toBe(false)
  } finally {
    vi.useRealTimers()
  }
})

test('settles promises for pending-visible match whose loader rejects AbortError after exiting', async () => {
  vi.useFakeTimers()

  try {
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const fromRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/from',
      pendingMs: 1,
      pendingComponent: {},
      loader: ({ abortController }) =>
        new Promise<void>((_resolve, reject) => {
          abortController.signal.addEventListener('abort', () => {
            const abortError = new Error('aborted')
            abortError.name = 'AbortError'
            reject(abortError)
          })
        }),
    })
    const toRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/to',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, fromRoute, toRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const fromNavigation = router.navigate({ to: '/from' })
    await vi.waitFor(() => expect(router.state.status).toBe('pending'))
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() =>
      expect(
        router.state.matches.some(
          (match) => match.id === '/from/from' && match.status === 'pending',
        ),
      ).toBe(true),
    )

    const fromMatch = router.state.matches.find(
      (match) => match.id === '/from/from',
    )!
    const loadPromise = fromMatch._.loadPromise

    expect(loadPromise?.status).toBe('pending')

    await router.navigate({ to: '/to' })
    await fromNavigation

    expect(router.state.location.pathname).toBe('/to')
    expect(loadPromise?.status).toBe('resolved')
    expect(fromMatch._.loadPromise).toBeUndefined()
    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.id === '/from/from'),
    ).toBe(false)
  } finally {
    vi.useRealTimers()
  }
})

test('loader AbortError respects pendingMinMs before committing error', async () => {
  vi.useFakeTimers()

  try {
    const abortError = new Error('soft aborted')
    abortError.name = 'AbortError'
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      pendingMs: 0,
      pendingMinMs: 100,
      pendingComponent: () => null,
      loader: () =>
        new Promise<void>((_resolve, reject) => {
          setTimeout(() => {
            reject(abortError)
          }, 10)
        }),
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/target'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)
    const targetMatch = matches.find(
      (match) => match.routeId === targetRoute.id,
    )!
    const initialUpdatedAt = targetMatch.updatedAt

    const loadPromise = loadMatches({
      router,
      location,
      matches,
      onReady: (readyMatches) => {
        const readyMatch = readyMatches.find(
          (match) => match.routeId === targetRoute.id,
        )!
        readyMatch._.loadPromise!.pendingUntil = Date.now() + 100
      },
    })

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(10)
    await Promise.resolve()

    expect(router.getMatch(targetMatch.id)?.status).toBe('pending')

    await vi.advanceTimersByTimeAsync(89)
    expect(router.getMatch(targetMatch.id)?.status).toBe('pending')

    await vi.advanceTimersByTimeAsync(1)
    await loadPromise

    const updatedMatch = getLaneMatch(matches, targetMatch.id)
    expect(updatedMatch?.status).toBe('error')
    expect(updatedMatch?.error).toBe(abortError)
    expect(updatedMatch?.updatedAt).toBeGreaterThan(initialUpdatedAt)
    expect(updatedMatch?._.loadPromise).toBeUndefined()
  } finally {
    vi.useRealTimers()
  }
})

test('loader AbortError waits for route component preload before committing error', async () => {
  const abortError = new Error('soft aborted')
  abortError.name = 'AbortError'
  const componentGate = createControlledPromise<void>()
  const rootRoute = new BaseRootRoute({})
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    loader: () => {
      throw abortError
    },
    component: { preload: () => componentGate } as any,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/target'] }),
  })
  const location = router.latestLocation
  const matches = router.matchRoutes(location)
  router.stores.setPending(matches)
  const targetMatch = matches.find((match) => match.routeId === targetRoute.id)!

  let loadSettled = false
  const loadPromise = loadMatches({ router, location, matches }).finally(() => {
    loadSettled = true
  })

  await vi.waitFor(() =>
    expect(router.getMatch(targetMatch.id)?._.loadPromise?.status).toBe(
      'pending',
    ),
  )
  expect(router.getMatch(targetMatch.id)?.status).toBe('pending')
  expect(loadSettled).toBe(false)

  componentGate.resolve()
  await loadPromise

  const updatedMatch = getLaneMatch(matches, targetMatch.id)
  expect(updatedMatch?.status).toBe('error')
  expect(updatedMatch?.error).toBe(abortError)
  expect(updatedMatch?._.loadPromise).toBeUndefined()
})

test('loader AbortError followed by component preload failure commits error', async () => {
  const chunkError = new Error('chunk failed')
  const componentGate = createControlledPromise<void>()
  const rootRoute = new BaseRootRoute({})
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    loader: () => {
      const abortError = new Error('soft aborted')
      abortError.name = 'AbortError'
      throw abortError
    },
    component: { preload: () => componentGate } as any,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/target'] }),
  })
  const location = router.latestLocation
  const matches = router.matchRoutes(location)
  router.stores.setPending(matches)
  const targetMatch = matches.find((match) => match.routeId === targetRoute.id)!

  const loadPromise = loadMatches({ router, location, matches }).then(
    () => undefined,
    (err) => err,
  )

  await vi.waitFor(() =>
    expect(router.getMatch(targetMatch.id)?._.loadPromise?.status).toBe(
      'pending',
    ),
  )

  componentGate.reject(chunkError)

  await expect(loadPromise).resolves.toBeUndefined()
  const updatedMatch = getLaneMatch(matches, targetMatch.id)
  expect(updatedMatch?.status).toBe('error')
  // Error finalization no longer waits on the whole-route component chunk,
  // so the pending-status AbortError commits immediately as the route error;
  // the later chunk rejection is owned separately and can retry on the next
  // load generation instead of replacing the committed failure.
  expect((updatedMatch?.error as Error | undefined)?.name).toBe('AbortError')
  expect(updatedMatch?._.loadPromise).toBeUndefined()
})

test('lazy route AbortError is not treated as a soft loader abort', async () => {
  const abortError = new Error('lazy aborted')
  abortError.name = 'AbortError'
  const lazyGate = createControlledPromise<any>()
  const rootRoute = new BaseRootRoute({})
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    loader: () => 'loaded',
  }).lazy(() => lazyGate)
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/target'] }),
  })
  const location = router.latestLocation
  const matches = router.matchRoutes(location)
  router.stores.setPending(matches)
  const targetMatch = matches.find((match) => match.routeId === targetRoute.id)!

  const loadPromise = loadMatches({ router, location, matches }).then(
    () => undefined,
    (err) => err,
  )
  await vi.waitFor(() =>
    expect(router.getMatch(targetMatch.id)?._.loadPromise).toBeDefined(),
  )

  lazyGate.reject(abortError)

  await expect(loadPromise).resolves.toBeUndefined()
  const updatedMatch = getLaneMatch(matches, targetMatch.id)
  expect(updatedMatch?.status).toBe('error')
  expect(updatedMatch?.error).toBe(abortError)
  expect(updatedMatch?._.loadPromise).toBeUndefined()
})

describe('head execution', () => {
  test('client asset projection never mutates the input match object', async () => {
    const oldMeta = [{ title: 'old' }]
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      head: () => ({ meta: [{ title: 'new' }] }),
      scripts: () => [{ children: 'target-script' }],
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/target'] }),
    })
    const matches = router.matchRoutes(router.stores.location.get())
    const original = matches.find((match) => match.routeId === targetRoute.id)!
    original.meta = oldMeta
    Object.freeze(original)

    await projectAssets({ router, matches })

    const updated = matches[original.index]!
    expect(updated).not.toBe(original)
    expect(original.meta).toBe(oldMeta)
    expect(updated.meta).toEqual([{ title: 'new' }])
    expect(updated.scripts).toEqual([{ children: 'target-script' }])
  })

  test('client asset projection handles async head rejection after scripts throws', async () => {
    const headGate = createControlledPromise<{
      meta: Array<{ title: string }>
    }>()
    const unhandledRejection = vi.fn()
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    process.on('unhandledRejection', unhandledRejection)

    try {
      const scriptsError = new Error('scripts failed')
      const rootRoute = new BaseRootRoute({})
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
        head: () => headGate,
        scripts: () => {
          throw scriptsError
        },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([targetRoute]),
        history: createMemoryHistory({ initialEntries: ['/target'] }),
      })
      const matches = router.matchRoutes(router.stores.location.get())

      await projectAssets({ router, matches })
      headGate.reject(new Error('head failed late'))
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(unhandledRejection).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandledRejection)
      consoleError.mockRestore()
    }
  })

  test('server asset projection handles async head and scripts rejection after headers throws', async () => {
    const headGate = createControlledPromise<{
      meta: Array<{ title: string }>
    }>()
    const scriptsGate = createControlledPromise<Array<{ children: string }>>()
    const unhandledRejection = vi.fn()
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    process.on('unhandledRejection', unhandledRejection)

    try {
      const headersError = new Error('headers failed')
      const rootRoute = new BaseRootRoute({})
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
        head: () => headGate,
        scripts: () => scriptsGate,
        headers: () => {
          throw headersError
        },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([targetRoute]),
        history: createMemoryHistory({ initialEntries: ['/target'] }),
        isServer: true,
      })
      const matches = router.matchRoutes(router.stores.location.get())
      const assets = projectServerRouteAssets(router, matches)
      if (assets) {
        await assets
      }

      headGate.reject(new Error('head failed late'))
      scriptsGate.reject(new Error('scripts failed late'))
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(unhandledRejection).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandledRejection)
      consoleError.mockRestore()
    }
  })

  const setupBeforeLoadNotFoundHierarchy = (throwAtIndex: 1 | 2 | 3) => {
    const loaderResolvers: Array<(() => void) | undefined> = []

    const makeLoader = (index: number) =>
      vi.fn(async () => {
        await new Promise<void>((resolve) => {
          loaderResolvers[index] = resolve
        })
        return { level: index }
      })

    const makeHead = (label: string) =>
      vi.fn(() => ({ meta: [{ title: label }] }))

    const rootRoute = new BaseRootRoute({
      loader: makeLoader(0),
      head: makeHead('Root'),
    })

    const level1Route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/level-1',
      loader: makeLoader(1),
      head: makeHead('Level 1'),
      beforeLoad:
        throwAtIndex === 1
          ? () => {
              throw notFound()
            }
          : undefined,
    })

    const level2Route = new BaseRoute({
      getParentRoute: () => level1Route,
      path: '/level-2',
      loader: makeLoader(2),
      head: makeHead('Level 2'),
      beforeLoad:
        throwAtIndex === 2
          ? () => {
              throw notFound()
            }
          : undefined,
    })

    const level3Route = new BaseRoute({
      getParentRoute: () => level2Route,
      path: '/level-3',
      loader: makeLoader(3),
      head: makeHead('Level 3'),
      beforeLoad:
        throwAtIndex === 3
          ? () => {
              throw notFound()
            }
          : undefined,
    })

    const routeTree = rootRoute.addChildren([
      level1Route.addChildren([level2Route.addChildren([level3Route])]),
    ])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/level-1/level-2/level-3'],
      }),
    })

    const routes = [rootRoute, level1Route, level2Route, level3Route] as const
    const loaders = routes.map(
      (route) => route.options.loader as ReturnType<typeof makeLoader>,
    )
    const heads = routes.map(
      (route) => route.options.head as ReturnType<typeof makeHead>,
    )

    return {
      router,
      routes,
      loaders,
      heads,
      loaderResolvers,
      throwAtIndex,
    }
  }

  test('head-triggered navigation prevents scripts and descendant assets from running', async () => {
    let router!: AnyRouter
    const staleScripts = vi.fn(() => [])
    const staleChildHead = vi.fn(() => ({}))
    const barBeforeLoad = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      head: () => {
        void router.navigate({ to: '/bar' })
        return {}
      },
      scripts: staleScripts,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => fooRoute,
      path: '/child',
      head: staleChildHead,
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
      beforeLoad: barBeforeLoad,
    })

    router = createTestRouter({
      routeTree: rootRoute.addChildren([
        fooRoute.addChildren([childRoute]),
        barRoute,
      ]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo/child' }).catch(() => undefined)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/bar'))

    expect(staleScripts).not.toHaveBeenCalled()
    expect(staleChildHead).not.toHaveBeenCalled()
    expect(barBeforeLoad).toHaveBeenCalledTimes(1)
  })

  test('same-href head reentry cannot run stale scripts or descendant heads', async () => {
    let router!: AnyRouter
    let reenter = false
    let didNavigate = false
    let headPass = 0
    let navigation: Promise<unknown> | undefined
    const scripts = vi.fn(() => [])
    const childHead = vi.fn(() => ({}))
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      head: () => {
        headPass += 1
        if (reenter && !didNavigate) {
          didNavigate = true
          navigation = Promise.resolve(router.navigate({ to: '/foo/child' }))
          return { meta: [{ title: 'stale' }] }
        }
        return { meta: [{ title: 'fresh' }] }
      },
      scripts,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => fooRoute,
      path: '/child',
      head: childHead,
    })

    router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/foo/child'] }),
    })

    await router.load()
    scripts.mockClear()
    childHead.mockClear()
    headPass = 0
    reenter = true

    await router.load()
    await navigation

    expect(headPass).toBe(2)
    expect(scripts).toHaveBeenCalledTimes(1)
    expect(childHead).toHaveBeenCalledTimes(1)
    expect(
      router.state.matches.find((match) => match.routeId === fooRoute.id)?.meta,
    ).toEqual([{ title: 'fresh' }])
  })

  const assertBeforeLoadNotFoundHierarchy = async (throwAtIndex: 1 | 2 | 3) => {
    const { router, routes, loaders, heads, loaderResolvers } =
      setupBeforeLoadNotFoundHierarchy(throwAtIndex)

    let loadResolved = false
    const loadPromise = router.load().then(() => {
      loadResolved = true
    })

    await Promise.resolve()
    await Promise.resolve()

    for (let i = 0; i < routes.length; i++) {
      const loader = loaders[i]!
      const expectedCalls = i < throwAtIndex ? 1 : 0
      expect(loader).toHaveBeenCalledTimes(expectedCalls)
    }

    expect(loadResolved).toBe(false)

    for (let i = 0; i < throwAtIndex; i++) {
      expect(loaderResolvers[i]).toBeDefined()
      loaderResolvers[i]!()
    }

    await loadPromise

    for (let i = 0; i < heads.length; i++) {
      const head = heads[i]!
      const expectedCalls = i <= throwAtIndex ? 1 : 0
      expect(head).toHaveBeenCalledTimes(expectedCalls)
    }

    for (let i = 0; i < throwAtIndex; i++) {
      const route = routes[i]!
      const match = router.state.matches.find((m) => m.routeId === route.id)
      expect(match?.loaderData).toEqual({ level: i })
    }

    const thrownRoute = routes[throwAtIndex]!
    const thrownMatch = router.state.matches.find(
      (m) => m.routeId === thrownRoute.id,
    )
    expect(thrownMatch?.status).toBe('notFound')
  }

  ;([1, 2, 3] as const).forEach((throwAtIndex) => {
    test(`beforeLoad notFound at hierarchy level ${throwAtIndex} waits for parent loader data and executes heads`, async () => {
      await assertBeforeLoadNotFoundHierarchy(throwAtIndex)
    })
  })

  test('synchronous head hooks execute serially in the same turn', async () => {
    let yielded = false
    const parentHead = vi.fn(() => {
      queueMicrotask(() => {
        yielded = true
      })
      return {}
    })
    const childHead = vi.fn(() => {
      expect(yielded).toBe(false)
      return {}
    })

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      head: parentHead,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      head: childHead,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    await router.load()

    expect(parentHead).toHaveBeenCalledTimes(1)
    expect(childHead).toHaveBeenCalledTimes(1)

    await Promise.resolve()
    expect(yielded).toBe(true)
  })

  test('synchronous parent scripts do not insert a microtask before child head', async () => {
    let yielded = false
    const parentScripts = vi.fn(() => {
      queueMicrotask(() => {
        yielded = true
      })
      return []
    })
    const childHead = vi.fn(() => {
      expect(yielded).toBe(false)
      return {}
    })

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      scripts: parentScripts,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      head: childHead,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    await router.load()

    expect(parentScripts).toHaveBeenCalledTimes(1)
    expect(childHead).toHaveBeenCalledTimes(1)

    await Promise.resolve()
    expect(yielded).toBe(true)
  })

  test('synchronous head that starts a newer navigation and throws stops the old pass', async () => {
    const oldHeadError = new Error('old head')
    const oldChildHead = vi.fn(() => ({}))
    const oldOnReady = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    let current = true

    try {
      const rootRoute = new BaseRootRoute({})
      const fooRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/foo',
        head: () => {
          current = false
          void router.navigate({ to: '/bar' })
          throw oldHeadError
        },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => fooRoute,
        path: '/child',
        head: oldChildHead,
      })
      const barRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/bar',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          fooRoute.addChildren([childRoute]),
          barRoute,
        ]),
        history: createMemoryHistory(),
      })

      const location = router.buildLocation({ to: '/foo/child' })
      const matches = router.matchRoutes(location)
      router.stores.setPending(matches)

      await loadMatches({
        router,
        location,
        matches,
        onReady: () => {
          oldOnReady()
        },
      })
      await projectAssets({
        router,
        matches,
        isCurrent: () => current,
      })
      await vi.waitFor(() =>
        expect(router.state.location.pathname).toBe('/bar'),
      )

      expect(consoleError).not.toHaveBeenCalled()
      expect(oldChildHead).not.toHaveBeenCalled()
      expect(oldOnReady).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  test('executes head once when loader throws notFound', async () => {
    const head = vi.fn(() => ({ meta: [{ title: 'Test' }] }))
    const rootRoute = new BaseRootRoute({})
    const testRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/test',
      loader: () => {
        throw notFound()
      },
      head,
    })
    const routeTree = rootRoute.addChildren([testRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/test'] }),
    })

    await router.load()

    expect(head).toHaveBeenCalledTimes(1)
    const match = router.state.matches.find((m) => m.routeId === testRoute.id)
    expect(match?.status).toBe('notFound')
  })

  test('propagates sync beforeLoad non-notFound error running ancestor loaders and heads', async () => {
    const beforeLoadError = new Error('beforeLoad-sync-error')
    const rootLoader = vi.fn(() => ({ level: 0 }))
    const rootHead = vi.fn(() => ({ meta: [{ title: 'Root' }] }))

    const rootRoute = new BaseRootRoute({
      loader: rootLoader,
      head: rootHead,
    })

    const childLoader = vi.fn(() => ({ level: 1 }))
    const childHead = vi.fn(() => ({ meta: [{ title: 'Child' }] }))

    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/test',
      beforeLoad: () => {
        throw beforeLoadError
      },
      loader: childLoader,
      head: childHead,
    })

    const routeTree = rootRoute.addChildren([childRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/test'] }),
    })

    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)

    await loadMatches({
      router,
      location,
      matches,
    })
    await projectAssets({ router, matches })

    expect(rootLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveBeenCalledTimes(0)
    // Head functions still run for ancestors up to the erroring match so that
    // SSR produces valid <head> content (e.g. charset, viewport, stylesheets).
    expect(rootHead).toHaveBeenCalledTimes(1)
    expect(childHead).toHaveBeenCalledTimes(1)
  })

  test('settles loadPromise when beforeLoad throws non-notFound error', async () => {
    const beforeLoadError = new Error('beforeLoad-sync-error')
    const rootRoute = new BaseRootRoute({})

    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/test',
      beforeLoad: () => {
        throw beforeLoadError
      },
    })

    const routeTree = rootRoute.addChildren([childRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/test'] }),
    })

    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    const childMatch = matches[1]!
    const loadPromise = childMatch._.loadPromise
    router.stores.setPending(matches)

    await loadMatches({
      router,
      location,
      matches,
    })

    const updatedMatch = getLaneMatch(matches, childMatch.id)
    expect(updatedMatch?.status).toBe('error')
    expect(loadPromise?.status).toBe('resolved')
    expect(updatedMatch?._.loadPromise).toBeUndefined()
  })

  test('propagates async beforeLoad non-notFound error running ancestor loaders and heads', async () => {
    const beforeLoadError = new Error('beforeLoad-async-error')
    const rootLoader = vi.fn(() => ({ level: 0 }))
    const rootHead = vi.fn(() => ({ meta: [{ title: 'Root' }] }))

    const rootRoute = new BaseRootRoute({
      loader: rootLoader,
      head: rootHead,
    })

    const childLoader = vi.fn(() => ({ level: 1 }))
    const childHead = vi.fn(() => ({ meta: [{ title: 'Child' }] }))

    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/test',
      beforeLoad: async () => {
        await Promise.resolve()
        throw beforeLoadError
      },
      loader: childLoader,
      head: childHead,
    })

    const routeTree = rootRoute.addChildren([childRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/test'] }),
    })

    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)

    await loadMatches({
      router,
      location,
      matches,
    })
    await projectAssets({ router, matches })

    expect(rootLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).toHaveBeenCalledTimes(0)
    // Head functions still run for ancestors up to the erroring match so that
    // SSR produces valid <head> content (e.g. charset, viewport, stylesheets).
    expect(rootHead).toHaveBeenCalledTimes(1)
    expect(childHead).toHaveBeenCalledTimes(1)
  })

  describe('beforeLoad notFound parent loader outcomes', () => {
    type ThrowAtIndex = 1 | 2 | 3
    type ParentFailure = 'notFound' | 'redirect'
    type ParentFailureMap = Partial<Record<0 | 1 | 2, ParentFailure>>
    type Scenario = {
      name: string
      throwAtIndex: ThrowAtIndex
      parentFailures: ParentFailureMap
      expectedErrorKind: 'notFound' | 'redirect'
      expectedErrorSource?: string
      expectedErrorRouteIndex?: 0 | 1 | 2 | 3
      expectedLoaderMaxIndex: number
      expectedRenderedHeadMaxIndex: number
      withDefaultNotFoundComponent?: boolean
      beforeLoadNotFoundFactory?: (
        routes: readonly [any, any, any, any],
      ) => ReturnType<typeof notFound>
    }

    const setupScenario = ({
      throwAtIndex,
      parentFailures,
      beforeLoadNotFoundFactory,
      withDefaultNotFoundComponent,
    }: {
      throwAtIndex: ThrowAtIndex
      parentFailures: ParentFailureMap
      beforeLoadNotFoundFactory?: Scenario['beforeLoadNotFoundFactory']
      withDefaultNotFoundComponent?: boolean
    }) => {
      const makeHead = (label: string) =>
        vi.fn(() => ({ meta: [{ title: label }] }))

      const makeLoader = (index: number) =>
        vi.fn(() => {
          const failure = parentFailures[index as 0 | 1 | 2]
          if (failure === 'notFound') {
            throw notFound({ data: { source: `loader-${index}` } })
          }
          if (failure === 'redirect') {
            throw redirect({ to: '/redirect-target' })
          }
          return { level: index }
        })

      const rootRoute = new BaseRootRoute({
        loader: makeLoader(0),
        head: makeHead('Root'),
      })

      const level1Route = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/level-1',
        loader: makeLoader(1),
        head: makeHead('Level 1'),
      })

      const level2Route = new BaseRoute({
        getParentRoute: () => level1Route,
        path: '/level-2',
        loader: makeLoader(2),
        head: makeHead('Level 2'),
      })

      const level3Route = new BaseRoute({
        getParentRoute: () => level2Route,
        path: '/level-3',
        loader: makeLoader(3),
        head: makeHead('Level 3'),
      })

      const redirectTargetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/redirect-target',
      })

      const routeTree = rootRoute.addChildren([
        level1Route.addChildren([level2Route.addChildren([level3Route])]),
        redirectTargetRoute,
      ])

      const routes = [rootRoute, level1Route, level2Route, level3Route] as const

      const throwRoute = routes[throwAtIndex]!
      throwRoute.options.beforeLoad = () => {
        const beforeLoadNotFound = beforeLoadNotFoundFactory
          ? beforeLoadNotFoundFactory(routes)
          : notFound({ data: { source: `beforeLoad-${throwAtIndex}` } })
        throw beforeLoadNotFound
      }

      const router = createTestRouter({
        routeTree,
        history: createMemoryHistory({
          initialEntries: ['/level-1/level-2/level-3'],
        }),
        ...(withDefaultNotFoundComponent
          ? { defaultNotFoundComponent: () => null }
          : {}),
      })

      const loaders = routes.map(
        (route) => route.options.loader as ReturnType<typeof makeLoader>,
      )
      const heads = routes.map(
        (route) => route.options.head as ReturnType<typeof makeHead>,
      )

      return {
        router,
        routes,
        loaders,
        heads,
      }
    }

    const runLoadMatchesAndCapture = async (
      router: AnyRouter,
      _headCount?: number,
    ) => {
      const location = router.latestLocation
      const matches = router.matchRoutes(location)
      router.stores.setPending(matches)

      try {
        await loadMatches({
          router,
          location,
          matches,
        })
      } catch (error) {
        if (!isRedirect(error)) {
          await projectAssets({ router, matches })
        }
        return { error, matches }
      }
      await projectAssets({ router, matches })
      return { error: undefined, matches }
    }

    const scenarios = [
      {
        name: 'throws beforeLoad notFound when parent loaders succeed',
        throwAtIndex: 3 as const,
        parentFailures: {} as ParentFailureMap,
        expectedErrorKind: 'notFound' as const,
        expectedErrorSource: 'beforeLoad-3',
        expectedLoaderMaxIndex: 2,
        expectedRenderedHeadMaxIndex: 3,
      },
      {
        name: 'uses parent loader notFound when parent loader throws notFound',
        throwAtIndex: 3 as const,
        parentFailures: { 1: 'notFound' } as ParentFailureMap,
        expectedErrorKind: 'notFound' as const,
        expectedErrorSource: 'loader-1',
        expectedLoaderMaxIndex: 2,
        expectedRenderedHeadMaxIndex: 1,
      },
      {
        name: 'uses first parent loader notFound when multiple parent loaders throw notFound',
        throwAtIndex: 3 as const,
        parentFailures: { 1: 'notFound', 2: 'notFound' } as ParentFailureMap,
        expectedErrorKind: 'notFound' as const,
        expectedErrorSource: 'loader-1',
        expectedLoaderMaxIndex: 2,
        expectedRenderedHeadMaxIndex: 1,
      },
      {
        name: 'uses parent loader notFound when root loader throws notFound',
        throwAtIndex: 2 as const,
        parentFailures: { 0: 'notFound' } as ParentFailureMap,
        expectedErrorKind: 'notFound' as const,
        expectedErrorSource: 'loader-0',
        expectedLoaderMaxIndex: 1,
        expectedRenderedHeadMaxIndex: 0,
      },
      {
        name: 'uses explicit routeId from beforeLoad notFound to target ancestor boundary',
        throwAtIndex: 3 as const,
        parentFailures: {} as ParentFailureMap,
        expectedErrorKind: 'notFound' as const,
        expectedErrorSource: 'beforeLoad-explicit-level1',
        expectedErrorRouteIndex: 1,
        expectedLoaderMaxIndex: 1,
        expectedRenderedHeadMaxIndex: 1,
        beforeLoadNotFoundFactory: (routes) =>
          notFound({
            routeId: routes[1].id as never,
            data: { source: 'beforeLoad-explicit-level1' },
          }),
      },
      {
        name: 'falls back to root boundary when beforeLoad notFound uses unknown routeId',
        throwAtIndex: 3 as const,
        parentFailures: {} as ParentFailureMap,
        expectedErrorKind: 'notFound' as const,
        expectedErrorSource: 'beforeLoad-invalid-route',
        expectedLoaderMaxIndex: 0,
        expectedRenderedHeadMaxIndex: 0,
        beforeLoadNotFoundFactory: () =>
          notFound({
            routeId: '/does-not-exist' as never,
            data: { source: 'beforeLoad-invalid-route' },
          }),
      },
      {
        name: 'falls back to root boundary when beforeLoad notFound uses non-exact routeId',
        throwAtIndex: 3 as const,
        parentFailures: {} as ParentFailureMap,
        expectedErrorKind: 'notFound' as const,
        expectedErrorSource: 'beforeLoad-non-exact-route',
        expectedLoaderMaxIndex: 0,
        expectedRenderedHeadMaxIndex: 0,
        beforeLoadNotFoundFactory: (routes) =>
          notFound({
            routeId: `${routes[1].id}/` as never,
            data: { source: 'beforeLoad-non-exact-route' },
          }),
      },
      {
        name: 'uses defaultNotFoundComponent without mutating root route when unknown routeId falls back to root',
        throwAtIndex: 3 as const,
        parentFailures: {} as ParentFailureMap,
        expectedErrorKind: 'notFound' as const,
        expectedErrorSource: 'beforeLoad-invalid-route-default',
        expectedLoaderMaxIndex: 0,
        expectedRenderedHeadMaxIndex: 0,
        withDefaultNotFoundComponent: true,
        beforeLoadNotFoundFactory: () =>
          notFound({
            routeId: '/does-not-exist' as never,
            data: { source: 'beforeLoad-invalid-route-default' },
          }),
      },
      {
        name: 'prioritizes redirect when parent loader throws redirect',
        throwAtIndex: 3 as const,
        parentFailures: { 0: 'redirect' } as ParentFailureMap,
        expectedErrorKind: 'redirect' as const,
        expectedErrorSource: undefined,
        expectedLoaderMaxIndex: 2,
        expectedRenderedHeadMaxIndex: -1,
      },
      {
        name: 'prioritizes redirect over root-loader notFound when both appear in settled loaders',
        throwAtIndex: 3 as const,
        parentFailures: { 0: 'notFound', 1: 'redirect' } as ParentFailureMap,
        expectedErrorKind: 'redirect' as const,
        expectedErrorSource: undefined,
        expectedLoaderMaxIndex: 2,
        expectedRenderedHeadMaxIndex: -1,
      },
    ] satisfies Array<Scenario>

    test.each(scenarios)('$name', async (scenario) => {
      const { router, routes, loaders, heads } = setupScenario({
        throwAtIndex: scenario.throwAtIndex,
        parentFailures: scenario.parentFailures,
        beforeLoadNotFoundFactory: scenario.beforeLoadNotFoundFactory,
        withDefaultNotFoundComponent: scenario.withDefaultNotFoundComponent,
      })

      const { error, matches } = await runLoadMatchesAndCapture(
        router,
        scenario.expectedRenderedHeadMaxIndex + 1,
      )

      for (let i = 0; i < routes.length; i++) {
        const loader = loaders[i]!
        const expectedCalls = i <= scenario.expectedLoaderMaxIndex ? 1 : 0
        expect(loader).toHaveBeenCalledTimes(expectedCalls)
      }

      for (let i = 0; i < heads.length; i++) {
        const head = heads[i]!
        const expectedCalls = i <= scenario.expectedRenderedHeadMaxIndex ? 1 : 0
        expect(head).toHaveBeenCalledTimes(expectedCalls)
      }

      if (scenario.expectedErrorKind === 'redirect') {
        expect(error).toEqual(
          expect.objectContaining({
            options: expect.objectContaining({
              to: '/redirect-target',
            }),
          }),
        )
        return
      }

      expect(error).toEqual(
        expect.objectContaining({
          isNotFound: true,
          data: { source: scenario.expectedErrorSource },
        }),
      )

      if (scenario.expectedErrorRouteIndex !== undefined) {
        expect((error as { routeId?: string }).routeId).toBe(
          routes[scenario.expectedErrorRouteIndex]!.id,
        )
      }

      if (scenario.withDefaultNotFoundComponent) {
        expect(routes[0].options.notFoundComponent).toBeUndefined()
        expect(matches[0]?.globalNotFound).toBe(true)
      }
    })

    test('sets globalNotFound on root match when beforeLoad notFound targets root boundary', async () => {
      const { router, routes } = setupScenario({
        throwAtIndex: 3,
        parentFailures: {},
        beforeLoadNotFoundFactory: (innerRoutes) =>
          notFound({
            routeId: innerRoutes[0].id as never,
            data: { source: 'beforeLoad-root-explicit' },
          }),
      })

      const { error, matches } = await runLoadMatchesAndCapture(router)

      expect(error).toEqual(
        expect.objectContaining({
          isNotFound: true,
          data: { source: 'beforeLoad-root-explicit' },
        }),
      )

      const rootMatch = matches.find((m) => m.routeId === routes[0].id)

      expect(rootMatch?.globalNotFound).toBe(true)
      expect(rootMatch?.status).toBe('success')
      expect(rootMatch?.error).toBeUndefined()
    })

    test('clears stale root globalNotFound when root loader is skipped', async () => {
      const rootLoader = vi.fn(() => ({ level: 0 }))
      const rootRoute = new BaseRootRoute({
        loader: rootLoader,
        staleTime: Infinity,
        shouldReload: () => false,
      })

      const childLoader = vi.fn(() => ({ level: 1 }))
      const childRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/test',
        loader: childLoader,
        staleTime: Infinity,
        shouldReload: () => false,
      })

      const routeTree = rootRoute.addChildren([childRoute])

      const router = createTestRouter({
        routeTree,
        history: createMemoryHistory({ initialEntries: ['/missing'] }),
      })

      await router.load()
      const missingRootMatch = router.state.matches.find(
        (m) => m.routeId === rootRoute.id,
      )
      expect(missingRootMatch?.globalNotFound).toBe(true)
      expect(rootLoader).toHaveBeenCalledTimes(1)

      await router.navigate({ to: '/test' })
      expect(rootLoader).toHaveBeenCalledTimes(1)
      expect(childLoader).toHaveBeenCalledTimes(1)

      const rootMatch = router.state.matches.find(
        (m) => m.routeId === rootRoute.id,
      )

      expect(rootMatch?.globalNotFound).toBe(false)
      expect(rootMatch?.error).toBeUndefined()
    })

    test('keeps root globalNotFound from overlapping stale initial load', async () => {
      const rootRoute = new BaseRootRoute({
        notFoundComponent: () => null,
      })
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const postsRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/posts',
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      const matchResult = router.getMatchedRoutes('/non-existent')
      expect(matchResult.foundRoute).toBeUndefined()
      expect(matchResult.matchedRoutes.map((route) => route.id)).toEqual([
        rootRoute.id,
      ])

      const initialLoad = router.load()
      const notFoundNavigation = router.navigate({
        to: '/non-existent' as never,
      })

      await Promise.all([initialLoad, notFoundNavigation])

      expect(router.state.location.pathname).toBe('/non-existent')
      expect(router.state.matches).toHaveLength(1)
      expect(router.state.matches[0]).toEqual(
        expect.objectContaining({
          routeId: rootRoute.id,
          status: 'success',
          globalNotFound: true,
        }),
      )
    })
  })
})

describe('params.parse notFound', () => {
  test('throws notFound on invalid params', async () => {
    const rootRoute = new BaseRootRoute({})
    const testRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/test/$id',
      params: {
        parse: ({ id }: { id: string }) => {
          const parsed = parseInt(id, 10)
          if (Number.isNaN(parsed)) {
            throw notFound()
          }
          return { id: parsed }
        },
      },
    })
    const routeTree = rootRoute.addChildren([testRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/test/invalid'] }),
    })

    await router.load()

    const match = router.stores.matches
      .get()
      .find((m) => m.routeId === testRoute.id)

    expect(match?.status).toBe('notFound')
  })

  test('succeeds on valid params', async () => {
    const rootRoute = new BaseRootRoute({})
    const testRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/test/$id',
      params: {
        parse: ({ id }: { id: string }) => {
          const parsed = parseInt(id, 10)
          if (Number.isNaN(parsed)) {
            throw notFound()
          }
          return { id: parsed }
        },
      },
    })
    const routeTree = rootRoute.addChildren([testRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/test/123'] }),
    })

    await router.load()

    const match = router.state.matches.find((m) => m.routeId === testRoute.id)
    expect(match?.status).toBe('success')
  })
})

describe('routeId in context options', () => {
  test('beforeLoad and context receive correct routeId for root route', async () => {
    const beforeLoad = vi.fn()
    const context = vi.fn()
    const rootRoute = new BaseRootRoute({
      beforeLoad,
      context,
    })

    const routeTree = rootRoute.addChildren([])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.load()

    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(beforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: rootRouteId,
      }),
    )

    expect(context).toHaveBeenCalledTimes(1)
    expect(context).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: rootRouteId,
      }),
    )
  })

  test('beforeLoad and context receive correct routeId for child route', async () => {
    const beforeLoad = vi.fn()
    const context = vi.fn()
    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad,
      context,
    })

    const routeTree = rootRoute.addChildren([fooRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })

    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(beforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/foo',
      }),
    )

    expect(context).toHaveBeenCalledTimes(1)
    expect(context).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/foo',
      }),
    )
  })

  test('beforeLoad and context receive correct routeId for nested route', async () => {
    const parentBeforeLoad = vi.fn()
    const parentContext = vi.fn()
    const childBeforeLoad = vi.fn()
    const childContext = vi.fn()
    const rootRoute = new BaseRootRoute({})

    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad: parentBeforeLoad,
      context: parentContext,
    })

    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      beforeLoad: childBeforeLoad,
      context: childContext,
    })

    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
    ])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/parent/child' })

    expect(parentBeforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/parent',
      }),
    )
    expect(parentContext).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/parent',
      }),
    )
    expect(childBeforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/parent/child',
      }),
    )
    expect(childContext).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/parent/child',
      }),
    )
  })

  test('beforeLoad and context receive correct routeId for route with dynamic params', async () => {
    const beforeLoad = vi.fn()
    const context = vi.fn()
    const rootRoute = new BaseRootRoute({})

    const postRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts/$postId',
      beforeLoad,
      context,
    })

    const routeTree = rootRoute.addChildren([postRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/posts/$postId', params: { postId: '123' } })

    expect(beforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/posts/$postId',
      }),
    )
    expect(context).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/posts/$postId',
      }),
    )
  })

  test('beforeLoad and context receive correct routeId for layout route', async () => {
    const beforeLoad = vi.fn()
    const context = vi.fn()
    const rootRoute = new BaseRootRoute({})

    const layoutRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      id: '/_layout',
      beforeLoad,
      context,
    })

    const indexRoute = new BaseRoute({
      getParentRoute: () => layoutRoute,
      path: '/',
    })

    const routeTree = rootRoute.addChildren([
      layoutRoute.addChildren([indexRoute]),
    ])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })

    await router.load()

    expect(beforeLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/_layout',
      }),
    )
    expect(context).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: '/_layout',
      }),
    )
  })

  test('context receives preload classification from the matching operation', async () => {
    const contextCalls: Array<{ preload: boolean; deps: unknown }> = []
    const rootRoute = new BaseRootRoute({})

    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loaderDeps: ({ search }: { search: Record<string, unknown> }) => ({
        q: search['q'],
      }),
      loader: () => undefined,
      context: ({ preload, deps }) => {
        contextCalls.push({ preload, deps })
      },
      preloadStaleTime: Infinity,
      staleTime: Infinity,
      gcTime: Infinity,
    })

    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({
      to: '/foo',
      search: { q: 'preload' },
    } as never)
    await router.navigate({
      to: '/foo',
      search: { q: 'navigate' },
    } as never)
    await router.navigate({
      to: '/foo',
      search: { q: 'preload' },
    } as never)

    expect(contextCalls).toEqual([
      { preload: true, deps: { q: 'preload' } },
      { preload: false, deps: { q: 'navigate' } },
    ])
  })

  test('preload-created matches carry preload cause', async () => {
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader: () => undefined,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    const matches = await router.preloadRoute({ to: '/foo' })
    const fooMatch = matches?.find((match) => match.routeId === fooRoute.id)

    expect(fooMatch?.cause).toBe('preload')
  })
})

describe('beforeLoad context lifecycle', () => {
  test('cached preload reload commits fresh beforeLoad context to returned match context', async () => {
    let token = 'one'
    const beforeLoad = vi.fn(() => ({ token }))

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad,
      preloadStaleTime: Infinity,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    const first = await router.preloadRoute({ to: '/foo' })
    const firstMatch = first?.find((match) => match.routeId === fooRoute.id)

    expect(firstMatch?.__beforeLoadContext).toEqual({ token: 'one' })
    expect(firstMatch?.context).toMatchObject({ token: 'one' })

    token = 'two'

    const second = await router.preloadRoute({ to: '/foo' })
    const secondMatch = second?.find((match) => match.routeId === fooRoute.id)

    expect(beforeLoad).toHaveBeenCalledTimes(2)
    expect(secondMatch?.__beforeLoadContext).toEqual({ token: 'two' })
    expect(secondMatch?.context).toMatchObject({ token: 'two' })
  })

  test('clears stale beforeLoad context when a later run returns undefined', async () => {
    let returnContext = true
    const seenContexts: Array<Record<string, unknown>> = []

    const rootRoute = new BaseRootRoute({
      beforeLoad: () => {
        return returnContext ? { token: 'one' } : undefined
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/child',
      staleTime: 0,
      loader: ({ context }) => {
        seenContexts.push(context)
      },
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([childRoute]),
      history: createMemoryHistory({ initialEntries: ['/child'] }),
    })

    await router.load()
    expect(seenContexts.at(-1)).toMatchObject({ token: 'one' })

    returnContext = false
    await router.invalidate({ sync: true })

    expect(seenContexts.at(-1)).not.toHaveProperty('token')
    expect(router.state.matches[0]?.__beforeLoadContext).toBeUndefined()
  })
})

describe('match loadPromise lifecycle', () => {
  const expectNotPendingWithoutLoadPromise = (match: any) => {
    expect(
      match?.status === 'pending' && match._.loadPromise === undefined,
    ).toBe(false)
  }

  const expectBeforeLoadPendingMinimum = async (
    outcome: 'error' | 'notFound' | 'redirect',
  ) => {
    vi.useFakeTimers()
    try {
      const beforeLoadError = new Error('beforeLoad failed')
      const rootRoute = new BaseRootRoute({})
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
        pendingMs: 0,
        pendingMinMs: 100,
        pendingComponent: () => null,
        beforeLoad: async () => {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 10)
          })

          if (outcome === 'error') {
            throw beforeLoadError
          }

          if (outcome === 'notFound') {
            throw notFound()
          }

          throw redirect({ to: '/redirected' })
        },
        errorComponent: () => null,
        notFoundComponent: () => null,
      })
      const redirectedRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/redirected',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([targetRoute, redirectedRoute]),
        history: createMemoryHistory({ initialEntries: ['/target'] }),
      })
      const location = router.latestLocation
      const matches = router.matchRoutes(location)
      router.stores.setPending(matches)
      const targetMatch = matches.find(
        (match) => match.routeId === targetRoute.id,
      )!

      const loadPromise = loadMatches({
        router,
        location,
        matches,
        onReady: (readyMatches) => {
          const readyMatch = readyMatches.find(
            (match) => match.routeId === targetRoute.id,
          )!
          const promise = readyMatch._.loadPromise
          if (promise) {
            promise.pendingUntil ??= Date.now() + 100
          }
        },
      }).then(
        () => undefined,
        (err) => err,
      )

      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(10)
      await Promise.resolve()

      expect(router.getMatch(targetMatch.id)?.status).toBe('pending')

      await vi.advanceTimersByTimeAsync(89)
      expect(router.getMatch(targetMatch.id)?.status).toBe('pending')

      await vi.advanceTimersByTimeAsync(1)
      const result = await loadPromise

      const updatedMatch = getLaneMatch(matches, targetMatch.id)
      if (outcome === 'error') {
        expect(result).toBeUndefined()
        expect(updatedMatch?.status).toBe('error')
        expect(updatedMatch?.error).toBe(beforeLoadError)
      } else if (outcome === 'notFound') {
        expect(result).toMatchObject({ isNotFound: true })
        expect(updatedMatch?.status).toBe('notFound')
      } else {
        expect(result).toMatchObject({
          options: expect.objectContaining({ to: '/redirected' }),
        })
      }
    } finally {
      vi.useRealTimers()
    }
  }

  test('visible pending + beforeLoad Error honors pendingMinMs', async () => {
    await expectBeforeLoadPendingMinimum('error')
  })

  test('visible pending + beforeLoad notFound honors pendingMinMs', async () => {
    await expectBeforeLoadPendingMinimum('notFound')
  })

  test('visible pending + beforeLoad redirect honors pendingMinMs', async () => {
    await expectBeforeLoadPendingMinimum('redirect')
  })

  test('visible pending remains until beforeLoad settles after pendingMs plus pendingMinMs', async () => {
    vi.useFakeTimers()
    try {
      const beforeLoadGate = createControlledPromise<{ auth: string }>()
      const rootRoute = new BaseRootRoute({})
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
        pendingMs: 10,
        pendingMinMs: 50,
        pendingComponent: () => null,
        beforeLoad: () => beforeLoadGate,
        loader: () => 'loaded',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([targetRoute]),
        history: createMemoryHistory({ initialEntries: ['/target'] }),
      })
      const location = router.latestLocation
      const matches = router.matchRoutes(location)
      router.stores.setPending(matches)
      const targetMatch = matches.find(
        (match) => match.routeId === targetRoute.id,
      )!
      let renderedMatch: AnyRouteMatch | undefined

      const loadPromise = loadMatches({
        router,
        location,
        matches,
        onReady: (readyMatches) => {
          renderedMatch = readyMatches.find(
            (match) => match.routeId === targetRoute.id,
          )
          const promise = renderedMatch?._.loadPromise
          if (promise) {
            promise.pendingUntil ??= Date.now() + 50
          }
        },
      })

      await vi.advanceTimersByTimeAsync(9)
      expect(renderedMatch).toBeUndefined()

      await vi.advanceTimersByTimeAsync(1)
      expect(renderedMatch?.status).toBe('pending')
      const loadGeneration = renderedMatch?._.loadPromise
      expect(loadGeneration?.status).toBe('pending')

      await vi.advanceTimersByTimeAsync(50)
      expect(loadGeneration?.status).toBe('pending')
      expect(router.getMatch(targetMatch.id)?.status).toBe('pending')

      beforeLoadGate.resolve({ auth: 'ok' })
      await loadPromise

      const updatedMatch = getLaneMatch(matches, targetMatch.id)
      expect(updatedMatch?.status).toBe('success')
      expect(updatedMatch?.context).toMatchObject({ auth: 'ok' })
      expect(updatedMatch?.loaderData).toBe('loaded')
      expect(loadGeneration?.status).toBe('resolved')
    } finally {
      vi.useRealTimers()
    }
  })

  test('resolved ancestor pending timer does not publish a slower child early', async () => {
    vi.useFakeTimers()
    try {
      const childLoaderGate = createControlledPromise<string>()
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        pendingMs: 10,
        pendingComponent: () => null,
        loader: async () => {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 1)
          })
          return 'parent'
        },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        pendingMs: 100,
        pendingComponent: () => null,
        loader: () => childLoaderGate,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      })
      const location = router.latestLocation
      const matches = router.matchRoutes(location)
      router.stores.setPending(matches)
      const readySnapshots: Array<Array<string>> = []

      const loadPromise = loadMatches({
        router,
        location,
        matches,
        onReady: (readyMatches) => {
          readySnapshots.push(
            readyMatches.map((match) => `${match.routeId}:${match.status}`),
          )
        },
      })

      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(9)
      expect(readySnapshots).toEqual([])

      childLoaderGate.resolve('child')
      await loadPromise

      expect(readySnapshots).toEqual([])
      const childMatch = matches.find(
        (match) => match.routeId === childRoute.id,
      )
      expect(childMatch?.status).toBe('success')
      expect(childMatch?.loaderData).toBe('child')
    } finally {
      vi.useRealTimers()
    }
  })

  test('publishing pending UI keeps isLoading true until the final lane commits', async () => {
    vi.useFakeTimers()

    try {
      const loaderGate = createControlledPromise<string>()
      const rootRoute = new BaseRootRoute({})
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
        pendingMs: 0,
        pendingComponent: () => null,
        loader: () => loaderGate,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([targetRoute]),
        history: createMemoryHistory({ initialEntries: ['/target'] }),
      })

      const loadPromise = router.load()
      await vi.waitFor(() =>
        expect(
          router.state.matches.some(
            (match) =>
              match.routeId === targetRoute.id && match.status === 'pending',
          ),
        ).toBe(true),
      )

      expect(router.state.isLoading).toBe(true)

      loaderGate.resolve('loaded')
      await loadPromise

      const targetMatch = router.state.matches.find(
        (match) => match.routeId === targetRoute.id,
      )!
      expect(targetMatch.status).toBe('success')
      expect(targetMatch.loaderData).toBe('loaded')
      expect(router.state.isLoading).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  test('stale beforeLoad failure cannot overwrite a newer same-id generation', async () => {
    const staleError = new Error('stale beforeLoad failed')
    const errorComponentGate = createControlledPromise<void>()
    const staleHead = vi.fn()
    const freshHead = vi.fn()
    const staleScripts = vi.fn()
    const freshScripts = vi.fn()
    const staleOnReady = vi.fn()
    let errorPreloadRun = 0
    const errorPreload = vi.fn(() => {
      errorPreloadRun++
      return errorPreloadRun === 1 ? errorComponentGate : undefined
    })
    let beforeLoadRun = 0
    const getAssetPass = ({ matches }: any) =>
      matches.some((match: any) => match.search?.pass === 'stale')
        ? 'stale'
        : 'fresh'

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      validateSearch: (search: Record<string, unknown>) => ({
        pass: search.pass,
      }),
      beforeLoad: () => {
        beforeLoadRun++
        if (beforeLoadRun === 1) {
          throw staleError
        }
      },
      loader: () => 'fresh',
      head: (ctx) => {
        if (getAssetPass(ctx) === 'stale') {
          staleHead()
        } else {
          freshHead()
        }
        return {}
      },
      scripts: (ctx) => {
        if (getAssetPass(ctx) === 'stale') {
          staleScripts()
        } else {
          freshScripts()
        }
        return []
      },
      errorComponent: { preload: errorPreload } as any,
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute, barRoute]),
      history: createMemoryHistory(),
    })

    const fooLocation = router.buildLocation({
      to: '/foo',
      search: { pass: 'stale' },
    } as never)
    const firstMatches = router.matchRoutes(fooLocation)
    router.stores.setPending(firstMatches)
    const staleLoad = loadMatches({
      router,
      location: fooLocation,
      matches: firstMatches,
      onReady: (readyMatches) => {
        staleOnReady(readyMatches)
      },
    })

    await vi.waitFor(() => expect(errorPreload).toHaveBeenCalledTimes(1))

    const barLocation = router.buildLocation({ to: '/bar' })
    router.cancelMatches()
    router.stores.setPending(router.matchRoutes(barLocation))

    const freshLocation = router.buildLocation({
      to: '/foo',
      search: { pass: 'fresh' },
    } as never)
    const secondMatches = router.matchRoutes(freshLocation)
    router.stores.setPending(secondMatches)
    await loadMatches({
      router,
      location: freshLocation,
      matches: secondMatches,
    })
    await projectAssets({ router, matches: secondMatches })

    const freshMatchBeforeRelease = getLaneMatch(
      secondMatches,
      secondMatches[1]!.id,
    )
    expect(freshMatchBeforeRelease?.routeId).toBe(fooRoute.id)
    expect(freshMatchBeforeRelease?.status).toBe('success')
    expect(freshMatchBeforeRelease?.error).toBeUndefined()

    errorComponentGate.resolve()
    await expect(staleLoad).resolves.toBe(firstMatches)

    const freshMatchAfterRelease = getLaneMatch(
      secondMatches,
      secondMatches[1]!.id,
    )
    expect(freshMatchAfterRelease?.routeId).toBe(fooRoute.id)
    expect(freshMatchAfterRelease?.status).toBe('success')
    expect(freshMatchAfterRelease?.error).toBeUndefined()
    expect(freshMatchAfterRelease?.loaderData).toBe('fresh')
    expect(beforeLoadRun).toBe(2)
    expect(staleHead).not.toHaveBeenCalled()
    expect(staleScripts).not.toHaveBeenCalled()
    expect(staleOnReady).not.toHaveBeenCalled()
    expect(freshHead).toHaveBeenCalledTimes(1)
    expect(freshScripts).toHaveBeenCalledTimes(1)
  })

  test('stale pass joining an existing loader generation cannot continue after a newer same-id pass', async () => {
    const loaderGate = createControlledPromise<string>()
    const loader = vi.fn(() => loaderGate)
    const initialHead = vi.fn()
    const staleHead = vi.fn()
    const freshHead = vi.fn()
    const staleScripts = vi.fn()
    const freshScripts = vi.fn()
    const staleOnReady = vi.fn()
    const getAssetPass = ({ matches }: any) =>
      matches.find((match: any) => match.routeId === '/foo')?.search?.pass

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      validateSearch: (search: Record<string, unknown>) => ({
        pass: search.pass,
      }),
      loader,
      head: (ctx) => {
        const pass = getAssetPass(ctx)
        if (pass === 'stale') {
          staleHead()
        } else if (pass === 'fresh') {
          freshHead()
        } else {
          initialHead()
        }
        return {}
      },
      scripts: (ctx) => {
        if (getAssetPass(ctx) === 'stale') {
          staleScripts()
        } else if (getAssetPass(ctx) === 'fresh') {
          freshScripts()
        }
        return []
      },
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    const initialLocation = router.buildLocation({
      to: '/foo',
      search: { pass: 'initial' },
    } as never)
    const initialMatches = router.matchRoutes(initialLocation)
    router.stores.setPending(initialMatches)
    const initialLoad = loadMatches({
      router,
      location: initialLocation,
      matches: initialMatches,
    })

    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
    const fooId = initialMatches[1]!.id
    const initialController = router.getMatch(fooId)!.abortController
    const initialGeneration = router.getMatch(fooId)!._.loadPromise
    expect(initialGeneration?.status).toBe('pending')

    const staleLocation = router.buildLocation({
      to: '/foo',
      search: { pass: 'stale' },
    } as never)
    const staleMatches = router.matchRoutes(staleLocation)
    router.stores.setPending(staleMatches)
    const staleLoad = loadMatches({
      router,
      location: staleLocation,
      matches: staleMatches,
      onReady: (readyMatches) => {
        staleOnReady(readyMatches)
      },
    })
    const staleController = router.getMatch(fooId)!.abortController
    expect(staleController).not.toBe(initialController)

    router.cancelMatches()
    const freshLocation = router.buildLocation({
      to: '/foo',
      search: { pass: 'fresh' },
    } as never)
    const freshMatches = router.matchRoutes(freshLocation)
    router.stores.setPending(freshMatches)
    const freshLoad = (async () => {
      await loadMatches({
        router,
        location: freshLocation,
        matches: freshMatches,
      })
      await projectAssets({ router, matches: freshMatches })
    })()
    const freshController = router.getMatch(fooId)!.abortController
    expect(freshController).not.toBe(staleController)

    loaderGate.resolve('loaded')
    await Promise.all([initialLoad, staleLoad, freshLoad])

    const finalMatch = getLaneMatch(freshMatches, fooId)
    expect(staleHead).not.toHaveBeenCalled()
    expect(staleScripts).not.toHaveBeenCalled()
    expect(staleOnReady).not.toHaveBeenCalled()
    expect(freshHead).toHaveBeenCalledTimes(1)
    expect(freshScripts).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(3)
    expect(finalMatch?.status).toBe('success')
    expect(finalMatch?.abortController).toBe(freshController)
    expect(finalMatch?._.loadPromise).toBeUndefined()
  })

  test('late rejection from an abandoned loader does not invoke onError or error-component preload', async () => {
    const loaderError = new Error('abandoned loader failed')
    const loaderGate = createControlledPromise<string>()
    const loader = vi.fn(() => loaderGate)
    const onError = vi.fn()
    const errorComponentPreload = vi.fn()
    const fooHead = vi.fn(() => ({}))
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      onError,
      head: fooHead,
      errorComponent: { preload: errorComponentPreload } as any,
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute, barRoute]),
      history: createMemoryHistory({ initialEntries: ['/foo'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)

    const staleLoad = loadMatches({ router, location, matches })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

    const fooMatch = router.getMatch(matches[1]!.id)!
    const oldLoadPromise = fooMatch._.loadPromise
    errorComponentPreload.mockClear()

    await router.navigate({ to: '/bar' })

    loaderGate.reject(loaderError)
    await expect(staleLoad).resolves.toBe(matches)

    expect(onError).not.toHaveBeenCalled()
    expect(errorComponentPreload).not.toHaveBeenCalled()
    expect(fooHead).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/bar')
    expect(
      router.state.matches.some((match) => match.routeId === fooRoute.id),
    ).toBe(false)
    expect(oldLoadPromise?.status).not.toBe('pending')
  })

  test('shouldReload-triggered navigation cancels the old pass before head and onReady', async () => {
    const oldHead = vi.fn(() => ({}))
    const oldScripts = vi.fn(() => [])
    const oldOnReady = vi.fn()
    let shouldNavigate = false
    let navigation: Promise<unknown> | undefined
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader: () => 'foo',
      shouldReload: ({ navigate }) => {
        if (shouldNavigate) {
          navigation = Promise.resolve(navigate({ to: '/bar' }))
          return false
        }
        return true
      },
      head: oldHead,
      scripts: oldScripts,
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute, barRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    oldHead.mockClear()
    oldScripts.mockClear()
    shouldNavigate = true

    const location = router.buildLocation({ to: '/foo' })
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)

    await loadMatches({
      router,
      location,
      matches,
      onReady: (readyMatches) => {
        oldOnReady(readyMatches)
      },
    })
    await navigation

    expect(router.state.location.pathname).toBe('/bar')
    expect(oldHead).not.toHaveBeenCalled()
    expect(oldScripts).not.toHaveBeenCalled()
    expect(oldOnReady).not.toHaveBeenCalled()
  })

  test('shouldReload navigation that returns true cancels the old pass before loader, head, and onReady', async () => {
    const staleLoader = vi.fn(() => 'stale')
    const staleHead = vi.fn(() => ({}))
    const staleScripts = vi.fn(() => [])
    const staleOnReady = vi.fn()
    let shouldNavigate = false
    let navigation: Promise<unknown> | undefined
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader: staleLoader,
      shouldReload: ({ navigate }) => {
        if (shouldNavigate) {
          navigation = Promise.resolve(navigate({ to: '/bar' }))
          return true
        }
        return true
      },
      head: staleHead,
      scripts: staleScripts,
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute, barRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    staleLoader.mockClear()
    staleHead.mockClear()
    staleScripts.mockClear()
    shouldNavigate = true

    const location = router.buildLocation({ to: '/foo' })
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)

    await loadMatches({
      router,
      location,
      matches,
      onReady: (readyMatches) => {
        staleOnReady(readyMatches)
      },
    })
    await navigation

    expect(router.state.location.pathname).toBe('/bar')
    expect(staleLoader).not.toHaveBeenCalled()
    expect(staleHead).not.toHaveBeenCalled()
    expect(staleScripts).not.toHaveBeenCalled()
    expect(staleOnReady).not.toHaveBeenCalled()
  })

  test('same-href shouldReload reentry cannot start old loader work', async () => {
    const loader = vi.fn(() => 'loaded')
    let reenter = false
    let didNavigate = false
    let navigation: Promise<unknown> | undefined
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      shouldReload: ({ navigate }) => {
        if (reenter && !didNavigate) {
          didNavigate = true
          navigation = Promise.resolve(navigate({ to: '/foo' }))
          return true
        }
        return true
      },
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/foo'] }),
    })

    await router.load()
    loader.mockClear()
    reenter = true

    await router.load()
    await navigation

    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/foo')
  })

  test('aborted generation does not invoke shouldReload', async () => {
    const shouldReload = vi.fn(() => true)
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader: () => 'foo',
      staleTime: 0,
      shouldReload,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/foo'] }),
    })

    await router.load()
    shouldReload.mockClear()

    const location = router.buildLocation({ to: '/foo' })
    const matches = router.matchRoutes(location)
    const fooMatch = matches.find((match) => match.routeId === fooRoute.id)!
    router.stores.setPending(matches)
    fooMatch.abortController.abort()

    await expect(
      loadMatches({
        router,
        location,
        matches,
      }),
    ).resolves.toBe(matches)

    expect(shouldReload).not.toHaveBeenCalled()
  })

  test('shouldReload that starts a newer navigation and then throws does not invoke stale onError', async () => {
    const staleError = new Error('stale shouldReload reentry failed')
    const staleOnError = vi.fn()
    const staleErrorPreload = vi.fn()
    let shouldNavigate = false
    let navigation: Promise<unknown> | undefined
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader: () => 'foo',
      shouldReload: ({ navigate }) => {
        if (shouldNavigate) {
          navigation = Promise.resolve(navigate({ to: '/bar' }))
          throw staleError
        }
        return true
      },
      onError: staleOnError,
      errorComponent: { preload: staleErrorPreload } as any,
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute, barRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    staleErrorPreload.mockClear()
    shouldNavigate = true

    const location = router.buildLocation({ to: '/foo' })
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)

    await loadMatches({
      router,
      location,
      matches,
    })
    await navigation

    expect(staleOnError).not.toHaveBeenCalled()
    expect(staleErrorPreload).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/bar')
  })

  test('same-href beforeLoad reentry does not invoke stale onError', async () => {
    const staleError = new Error('stale beforeLoad reentry failed')
    const staleOnError = vi.fn()
    const staleErrorPreload = vi.fn()
    let reenter = false
    let didNavigate = false
    let navigation: Promise<unknown> | undefined
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad: ({ navigate }) => {
        if (reenter && !didNavigate) {
          didNavigate = true
          navigation = Promise.resolve(navigate({ to: '/foo' }))
          throw staleError
        }
        return { didNavigate }
      },
      onError: staleOnError,
      errorComponent: { preload: staleErrorPreload } as any,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/foo'] }),
    })

    await router.load()
    staleErrorPreload.mockClear()
    reenter = true

    await router.load()
    await navigation

    expect(staleOnError).not.toHaveBeenCalled()
    expect(staleErrorPreload).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/foo')
    expect(
      router.state.matches.some((match) => match.error === staleError),
    ).toBe(false)
  })

  test('async head from a stale same-ID pass cannot overwrite a newer pass', async () => {
    const staleHeadGate = createControlledPromise<{
      meta: Array<{ title: string }>
    }>()
    const staleHead = vi.fn(() => staleHeadGate)
    const freshHead = vi.fn(() => ({ meta: [{ title: 'fresh' }] }))
    const staleChildHead = vi.fn(() => ({}))
    const freshChildHead = vi.fn(() => ({}))
    const staleOnReady = vi.fn()
    const freshOnReady = vi.fn()
    const getAssetPass = ({ matches }: any) =>
      matches.find((match: any) => match.routeId === '/foo')?.search?.pass

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      validateSearch: (search: Record<string, unknown>) => ({
        pass: search.pass,
      }),
      loader: () => 'loaded',
      head: (ctx) => {
        if (getAssetPass(ctx) === 'stale') {
          staleHead()
          return staleHeadGate
        }
        return freshHead()
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => fooRoute,
      path: '/child',
      head: (ctx) => {
        if (getAssetPass(ctx) === 'stale') {
          staleChildHead()
        } else {
          freshChildHead()
        }
        return {}
      },
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute.addChildren([childRoute])]),
      history: createMemoryHistory(),
    })

    const staleLocation = router.buildLocation({
      to: '/foo/child',
      search: { pass: 'stale' },
    } as never)
    const staleMatches = router.matchRoutes(staleLocation)
    router.stores.setPending(staleMatches)
    const fooId = staleMatches.find(
      (match) => match.routeId === fooRoute.id,
    )!.id
    const staleLoad = (async () => {
      await loadMatches({
        router,
        location: staleLocation,
        matches: staleMatches,
        onReady: (readyMatches) => {
          staleOnReady(readyMatches)
        },
      })
      await projectAssets({
        router,
        matches: staleMatches,
        isCurrent: () => router.getMatch(fooId)?.search.pass === 'stale',
      })
      return staleMatches
    })()

    await vi.waitFor(() => expect(staleHead).toHaveBeenCalledTimes(1))

    router.cancelMatches()
    const freshLocation = router.buildLocation({
      to: '/foo/child',
      search: { pass: 'fresh' },
    } as never)
    const freshMatches = router.matchRoutes(freshLocation)
    router.stores.setPending(freshMatches)
    await loadMatches({
      router,
      location: freshLocation,
      matches: freshMatches,
      onReady: (readyMatches) => {
        freshOnReady(readyMatches)
      },
    })
    await projectAssets({ router, matches: freshMatches })
    router.stores.setPending(freshMatches)

    expect(router.getMatch(fooId)?.meta).toEqual([
      expect.objectContaining({ title: 'fresh' }),
    ])

    staleHeadGate.resolve({ meta: [{ title: 'stale' }] })
    await expect(staleLoad).resolves.toBe(staleMatches)

    expect(router.getMatch(fooId)?.meta).toEqual([
      expect.objectContaining({ title: 'fresh' }),
    ])
    expect(staleChildHead).not.toHaveBeenCalled()
    expect(staleOnReady).not.toHaveBeenCalled()
    expect(freshHead).toHaveBeenCalledTimes(1)
    expect(freshChildHead).toHaveBeenCalledTimes(1)
    expect(freshOnReady).not.toHaveBeenCalled()
  })

  test('rejected async head from a stale same-ID pass is ignored', async () => {
    const staleHeadGate = createControlledPromise<{
      meta: Array<{ title: string }>
    }>()
    const staleHead = vi.fn(() => staleHeadGate)
    const freshHead = vi.fn(() => ({ meta: [{ title: 'fresh' }] }))
    const staleChildHead = vi.fn(() => ({}))
    const freshChildHead = vi.fn(() => ({}))
    const staleOnReady = vi.fn()
    const freshOnReady = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const getAssetPass = ({ matches }: any) =>
      matches.find((match: any) => match.routeId === '/foo')?.search?.pass

    try {
      const rootRoute = new BaseRootRoute({})
      const fooRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/foo',
        validateSearch: (search: Record<string, unknown>) => ({
          pass: search.pass,
        }),
        loader: () => 'loaded',
        head: (ctx) => {
          if (getAssetPass(ctx) === 'stale') {
            staleHead()
            return staleHeadGate
          }
          return freshHead()
        },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => fooRoute,
        path: '/child',
        head: (ctx) => {
          if (getAssetPass(ctx) === 'stale') {
            staleChildHead()
          } else {
            freshChildHead()
          }
          return {}
        },
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([fooRoute.addChildren([childRoute])]),
        history: createMemoryHistory(),
      })

      const staleLocation = router.buildLocation({
        to: '/foo/child',
        search: { pass: 'stale' },
      } as never)
      const staleMatches = router.matchRoutes(staleLocation)
      router.stores.setPending(staleMatches)
      const fooId = staleMatches.find(
        (match) => match.routeId === fooRoute.id,
      )!.id
      const staleLoad = (async () => {
        await loadMatches({
          router,
          location: staleLocation,
          matches: staleMatches,
          onReady: (readyMatches) => {
            staleOnReady(readyMatches)
          },
        })
        await projectAssets({
          router,
          matches: staleMatches,
          isCurrent: () => router.getMatch(fooId)?.search.pass === 'stale',
        })
        return staleMatches
      })()

      await vi.waitFor(() => expect(staleHead).toHaveBeenCalledTimes(1))

      router.cancelMatches()
      const freshLocation = router.buildLocation({
        to: '/foo/child',
        search: { pass: 'fresh' },
      } as never)
      const freshMatches = router.matchRoutes(freshLocation)
      router.stores.setPending(freshMatches)
      await loadMatches({
        router,
        location: freshLocation,
        matches: freshMatches,
        onReady: (readyMatches) => {
          freshOnReady(readyMatches)
        },
      })
      await projectAssets({ router, matches: freshMatches })
      router.stores.setPending(freshMatches)

      staleHeadGate.reject(new Error('stale head failed'))
      await expect(staleLoad).resolves.toBe(staleMatches)

      expect(consoleError).not.toHaveBeenCalled()
      expect(router.getMatch(fooId)?.meta).toEqual([
        expect.objectContaining({ title: 'fresh' }),
      ])
      expect(staleChildHead).not.toHaveBeenCalled()
      expect(staleOnReady).not.toHaveBeenCalled()
      expect(freshHead).toHaveBeenCalledTimes(1)
      expect(freshChildHead).toHaveBeenCalledTimes(1)
      expect(freshOnReady).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  test('pending preload-owned match is cached only after async head work', async () => {
    const headGate = createControlledPromise<{
      meta: Array<{ title: string }>
    }>()
    const parentHead = vi.fn(() => headGate)
    const childHead = vi.fn(() => ({}))
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => 'parent',
      head: parentHead,
      gcTime: 60_000,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      head: childHead,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory(),
    })

    const preload = router.preloadRoute({ to: '/parent/child' })
    await vi.waitFor(() => expect(parentHead).toHaveBeenCalledTimes(1))
    expect(router.stores.cachedMatches.get()).toEqual([])

    headGate.resolve({ meta: [{ title: 'detached' }] })
    await preload

    const parentMatch = router.stores.cachedMatches
      .get()
      .find((match) => match.routeId === parentRoute.id)!
    expect(parentMatch.meta).toEqual([{ title: 'detached' }])
    expect(parentMatch.status).toBe('success')
    expect(parentMatch._.loadPromise).toBeUndefined()
    expect(parentMatch.error).toBeUndefined()
    expect(childHead).toHaveBeenCalledTimes(1)
    expectNoCachedActiveOverlap(router)
  })

  test('beforeLoad onError-triggered navigation cancels the old failure', async () => {
    const failure = new Error('beforeLoad failed')
    let router!: AnyRouter
    const onError = vi.fn(() => {
      void router.navigate({ to: '/bar' })
    })
    const fooHead = vi.fn(() => ({}))
    const barBeforeLoad = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad: () => {
        throw failure
      },
      onError,
      head: fooHead,
      errorComponent: () => null,
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
      beforeLoad: barBeforeLoad,
    })

    router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute, barRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' }).catch(() => undefined)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/bar'))

    expect(onError).toHaveBeenCalledTimes(1)
    expect(barBeforeLoad).toHaveBeenCalledTimes(1)
    expect(fooHead).not.toHaveBeenCalled()
    expect(router.state.matches.some((match) => match.error === failure)).toBe(
      false,
    )
  })

  test('synchronous beforeLoad navigation cancels the old pass even when beforeLoad returns normally', async () => {
    let router!: AnyRouter
    const childLoader = vi.fn(() => 'stale child')
    const oldHead = vi.fn(() => ({}))
    const barBeforeLoad = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad: () => {
        void router.navigate({ to: '/bar' })
        return { staleContext: true }
      },
      head: oldHead,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => fooRoute,
      path: '/child',
      loader: childLoader,
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
      beforeLoad: barBeforeLoad,
    })

    router = createTestRouter({
      routeTree: rootRoute.addChildren([
        fooRoute.addChildren([childRoute]),
        barRoute,
      ]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo/child' }).catch(() => undefined)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/bar'))

    expect(childLoader).not.toHaveBeenCalled()
    expect(oldHead).not.toHaveBeenCalled()
    expect(barBeforeLoad).toHaveBeenCalledTimes(1)
  })

  test('synchronous beforeLoad navigation followed by redirect does not let the stale redirect win', async () => {
    let router!: AnyRouter
    const barBeforeLoad = vi.fn()
    const bazBeforeLoad = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      beforeLoad: () => {
        void router.navigate({ to: '/bar' })
        return redirect({ to: '/baz' })
      },
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
      beforeLoad: barBeforeLoad,
    })
    const bazRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/baz',
      beforeLoad: bazBeforeLoad,
    })

    router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute, barRoute, bazRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' }).catch(() => undefined)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/bar'))

    expect(barBeforeLoad).toHaveBeenCalledTimes(1)
    expect(bazBeforeLoad).not.toHaveBeenCalled()
  })

  test('loader onError-triggered navigation cancels stale error finalization', async () => {
    const failure = new Error('loader failed')
    let router!: AnyRouter
    const onError = vi.fn(() => {
      void router.navigate({ to: '/bar' })
    })
    const fooHead = vi.fn(() => ({}))
    const barBeforeLoad = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader: () => {
        throw failure
      },
      onError,
      head: fooHead,
      errorComponent: () => null,
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
      beforeLoad: barBeforeLoad,
    })

    router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute, barRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' }).catch(() => undefined)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/bar'))

    expect(onError).toHaveBeenCalledTimes(1)
    expect(barBeforeLoad).toHaveBeenCalledTimes(1)
    expect(fooHead).not.toHaveBeenCalled()
    expect(router.state.matches.some((match) => match.error === failure)).toBe(
      false,
    )
  })

  test('loader that ignores abort cannot commit while a newer navigation is pending', async () => {
    const fooLoaderGate = createControlledPromise<{ value: string }>()
    const barBeforeLoadGate = createControlledPromise<void>()
    const fooLoader = vi.fn(() => fooLoaderGate)
    const fooHead = vi.fn(() => ({}))
    const fooScripts = vi.fn(() => [])
    const barBeforeLoad = vi.fn(() => barBeforeLoadGate)
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader: fooLoader,
      head: fooHead,
      scripts: fooScripts,
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
      beforeLoad: barBeforeLoad,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute, barRoute]),
      history: createMemoryHistory(),
    })

    const fooNavigation = router.navigate({ to: '/foo' }).catch(() => undefined)
    await vi.waitFor(() => expect(fooLoader).toHaveBeenCalledTimes(1))
    const fooMatch = router.getMatch('/foo/foo')!
    expect(fooMatch._.loadPromise?.status).toBe('pending')

    const barNavigation = router.navigate({ to: '/bar' })
    await vi.waitFor(() => expect(barBeforeLoad).toHaveBeenCalledTimes(1))
    expect(fooMatch.abortController.signal.aborted).toBe(true)

    fooLoaderGate.resolve({ value: 'stale' })
    await Promise.resolve()

    expect(router.getMatch('/foo/foo')?.loaderData).toBeUndefined()
    expect(fooHead).not.toHaveBeenCalled()
    expect(fooScripts).not.toHaveBeenCalled()

    barBeforeLoadGate.resolve()
    await barNavigation
    await fooNavigation

    expect(router.state.location.pathname).toBe('/bar')
  })

  test('aborted async beforeLoad does not invoke onError, heads, or descendants', async () => {
    const beforeLoadGate = createControlledPromise<void>()
    const onError = vi.fn()
    const parentHead = vi.fn(() => ({}))
    const parentScripts = vi.fn(() => [])
    const childLoader = vi.fn(() => 'child')
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad: async () => {
        await beforeLoadGate
        throw new Error('aborted beforeLoad failed')
      },
      onError,
      head: parentHead,
      scripts: parentScripts,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: childLoader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)

    const loadPromise = loadMatches({ router, location, matches })
    await vi.waitFor(() =>
      expect(getLaneMatch(matches, matches[1]!.id)?.isFetching).toBe(
        'beforeLoad',
      ),
    )

    router.cancelMatches()
    beforeLoadGate.resolve()

    await expect(loadPromise).resolves.toBe(matches)
    expect(onError).not.toHaveBeenCalled()
    expect(parentHead).not.toHaveBeenCalled()
    expect(parentScripts).not.toHaveBeenCalled()
    expect(childLoader).not.toHaveBeenCalled()
  })

  test('applies pendingMinMs when pending renders during component preload', async () => {
    vi.useFakeTimers()
    try {
      const componentGate = createControlledPromise<void>()
      const rootRoute = new BaseRootRoute({})
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
        pendingMs: 0,
        pendingMinMs: 100,
        pendingComponent: () => null,
        loader: () => 'loaded',
        component: { preload: () => componentGate } as any,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([targetRoute as any]),
        history: createMemoryHistory({ initialEntries: ['/target'] }),
      })
      const location = router.latestLocation
      const matches = router.matchRoutes(location)
      router.stores.setPending(matches)
      const targetMatch = matches.find(
        (match) => match.routeId === targetRoute.id,
      )!

      const loadPromise = loadMatches({
        router,
        location,
        matches,
        onReady: (readyMatches) => {
          const readyMatch = readyMatches.find(
            (match) => match.routeId === targetRoute.id,
          )!
          const promise = readyMatch._.loadPromise
          if (promise) {
            promise.pendingUntil ??= Date.now() + 100
          }
        },
      })

      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(10)
      componentGate.resolve()
      await Promise.resolve()

      expect(router.getMatch(targetMatch.id)?.status).toBe('pending')

      await vi.advanceTimersByTimeAsync(89)
      expect(router.getMatch(targetMatch.id)?.status).toBe('pending')

      await vi.advanceTimersByTimeAsync(1)
      await loadPromise

      const updatedMatch = getLaneMatch(matches, targetMatch.id)
      expect(updatedMatch?.status).toBe('success')
      expect(updatedMatch?._.loadPromise).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  test('applies pendingMinMs when pending renders during error component preload', async () => {
    vi.useFakeTimers()
    try {
      const errorGate = createControlledPromise<void>()
      const rootRoute = new BaseRootRoute({})
      const errorRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/error',
        pendingMs: 0,
        pendingMinMs: 100,
        pendingComponent: () => null,
        loader: () => {
          throw new Error('loader failed')
        },
        errorComponent: { preload: () => errorGate } as any,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([errorRoute]),
        history: createMemoryHistory({ initialEntries: ['/error'] }),
      })
      const location = router.latestLocation
      const matches = router.matchRoutes(location)
      router.stores.setPending(matches)
      const errorMatch = matches.find(
        (match) => match.routeId === errorRoute.id,
      )!

      const loadPromise = loadMatches({
        router,
        location,
        matches,
        onReady: (readyMatches) => {
          const readyMatch = readyMatches.find(
            (match) => match.routeId === errorRoute.id,
          )!
          const promise = readyMatch._.loadPromise
          if (promise) {
            promise.pendingUntil ??= Date.now() + 100
          }
        },
      })

      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(10)
      errorGate.resolve()
      await Promise.resolve()

      expect(router.getMatch(errorMatch.id)?.status).toBe('pending')

      await vi.advanceTimersByTimeAsync(89)
      expect(router.getMatch(errorMatch.id)?.status).toBe('pending')

      await vi.advanceTimersByTimeAsync(1)
      await loadPromise

      const updatedMatch = getLaneMatch(matches, errorMatch.id)
      expect(updatedMatch?.status).toBe('error')
      expect(updatedMatch?._.loadPromise).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  test('applies pendingMinMs when pending renders during notFound component preload', async () => {
    vi.useFakeTimers()
    try {
      const notFoundGate = createControlledPromise<void>()
      const rootRoute = new BaseRootRoute({})
      const missingRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/missing',
        pendingMs: 0,
        pendingMinMs: 100,
        pendingComponent: () => null,
        loader: () => notFound(),
        notFoundComponent: { preload: () => notFoundGate } as any,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([missingRoute]),
        history: createMemoryHistory({ initialEntries: ['/missing'] }),
      })
      const location = router.latestLocation
      const matches = router.matchRoutes(location)
      router.stores.setPending(matches)
      const missingMatch = matches.find(
        (match) => match.routeId === missingRoute.id,
      )!

      const loadPromise = loadMatches({
        router,
        location,
        matches,
        onReady: (readyMatches) => {
          const readyMatch = readyMatches.find(
            (match) => match.routeId === missingRoute.id,
          )!
          const promise = readyMatch._.loadPromise
          if (promise) {
            promise.pendingUntil ??= Date.now() + 100
          }
        },
      }).then(
        () => undefined,
        (err) => err,
      )

      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(10)
      notFoundGate.resolve()
      await Promise.resolve()

      expect(router.getMatch(missingMatch.id)?.status).toBe('pending')

      await vi.advanceTimersByTimeAsync(89)
      expect(router.getMatch(missingMatch.id)?.status).toBe('pending')

      await vi.advanceTimersByTimeAsync(1)
      await expect(loadPromise).resolves.toMatchObject({ isNotFound: true })

      const updatedMatch = getLaneMatch(matches, missingMatch.id)
      expect(updatedMatch?.status).toBe('notFound')
      expect(updatedMatch?._.loadPromise).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  test('lazy route function throwing synchronously commits error and clears promises', async () => {
    const lazyError = new Error('lazy failed')
    const rootRoute = new BaseRootRoute({})
    const lazyRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/lazy',
    }).lazy(() => {
      throw lazyError
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([lazyRoute]),
      history: createMemoryHistory({ initialEntries: ['/lazy'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)
    const lazyMatch = matches.find((match) => match.routeId === lazyRoute.id)!

    await expect(loadMatches({ router, location, matches })).resolves.toBe(
      matches,
    )

    const updatedMatch = getLaneMatch(matches, lazyMatch.id)
    expect(updatedMatch?.status).toBe('error')
    expect(updatedMatch?.error).toBe(lazyError)
    expect(updatedMatch?._.loadPromise).toBeUndefined()
    expectNotPendingWithoutLoadPromise(updatedMatch)
  })

  test('component preload throwing synchronously commits error and clears promises', async () => {
    const preloadError = new Error('component failed')
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loader: () => 'loaded',
      component: {
        preload: () => {
          throw preloadError
        },
      } as any,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/target'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)
    const targetMatch = matches.find(
      (match) => match.routeId === targetRoute.id,
    )!

    await expect(loadMatches({ router, location, matches })).resolves.toBe(
      matches,
    )

    const updatedMatch = getLaneMatch(matches, targetMatch.id)
    expect(updatedMatch?.status).toBe('error')
    expect(updatedMatch?.error).toBe(preloadError)
    expect(updatedMatch?._.loadPromise).toBeUndefined()
    expectNotPendingWithoutLoadPromise(updatedMatch)
  })

  test('sync errorComponent preload error replaces loader error and settles the match', async () => {
    const preloadError = new Error('error boundary failed')
    const rootRoute = new BaseRootRoute({})
    const errorRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/error',
      loader: () => {
        throw new Error('loader failed')
      },
      errorComponent: {
        preload: () => {
          throw preloadError
        },
      } as any,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([errorRoute]),
      history: createMemoryHistory({ initialEntries: ['/error'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)
    const errorMatch = matches.find((match) => match.routeId === errorRoute.id)!

    await expect(loadMatches({ router, location, matches })).resolves.toBe(
      matches,
    )

    const updatedMatch = getLaneMatch(matches, errorMatch.id)
    expect(updatedMatch?.status).toBe('error')
    expect(updatedMatch?.error).toBe(preloadError)
    expect(updatedMatch?._.loadPromise).toBeUndefined()
    expectNotPendingWithoutLoadPromise(updatedMatch)
  })

  test('notFoundComponent preload throwing synchronously cannot leave status pending', async () => {
    const preloadError = new Error('notFound boundary failed')
    const rootRoute = new BaseRootRoute({})
    const missingRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/missing',
      loader: () => notFound(),
      notFoundComponent: {
        preload: () => {
          throw preloadError
        },
      } as any,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([missingRoute]),
      history: createMemoryHistory({ initialEntries: ['/missing'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)
    const missingMatch = matches.find(
      (match) => match.routeId === missingRoute.id,
    )!

    await expect(loadMatches({ router, location, matches })).resolves.toBe(
      matches,
    )

    const updatedMatch = getLaneMatch(matches, missingMatch.id)
    expect(updatedMatch?.status).toBe('error')
    expect(updatedMatch?.error).toBe(preloadError)
    expect(updatedMatch?._.loadPromise).toBeUndefined()
    expectNotPendingWithoutLoadPromise(updatedMatch)
  })

  test('ancestor notFoundComponent preload failure commits error at the ancestor boundary', async () => {
    const boundaryError = new Error('ancestor notFound boundary failed')
    const notFoundGate = createControlledPromise<void>()
    const notFoundPreload = vi.fn(() => notFoundGate)
    const childHead = vi.fn(() => ({ meta: [{ title: 'Child' }] }))
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      ssr: 'data-only',
      notFoundComponent: { preload: notFoundPreload } as any,
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: () => notFound({ routeId: parentRoute.id }),
      head: childHead,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      isServer: true,
    })

    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)
    const load = loadMatches({ router, location, matches }).then(
      () => undefined,
      (err) => err,
    )
    await vi.waitFor(() => expect(notFoundPreload).toHaveBeenCalledTimes(1))

    notFoundGate.reject(boundaryError)
    await expect(load).resolves.toBe(boundaryError)

    expect(matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
    ])

    const parentMatch = matches.at(-1)!
    expect(parentMatch.status).toBe('error')
    expect(parentMatch.error).toBe(boundaryError)
    expect(childHead).not.toHaveBeenCalled()
    expect(notFoundPreload).toHaveBeenCalledTimes(1)
    expect(parentMatch._.loadPromise).toBeUndefined()
  })

  test('onError throwing notFound calls notFoundComponent preload once', async () => {
    const notFoundPreload = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const errorRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/error',
      loader: () => {
        throw new Error('loader failed')
      },
      onError: () => {
        throw notFound()
      },
      notFoundComponent: { preload: notFoundPreload } as any,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([errorRoute]),
      history: createMemoryHistory({ initialEntries: ['/error'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)
    const errorMatch = matches.find((match) => match.routeId === errorRoute.id)!

    await expect(
      loadMatches({ router, location, matches }),
    ).rejects.toMatchObject({ isNotFound: true })

    const updatedMatch = getLaneMatch(matches, errorMatch.id)
    expect(updatedMatch?.status).toBe('notFound')
    expect(updatedMatch?._.loadPromise).toBeUndefined()
    expectNotPendingWithoutLoadPromise(updatedMatch)
    expect(notFoundPreload).toHaveBeenCalledTimes(1)
  })

  test('onError throwing notFound targets the failing route boundary before descendants', async () => {
    const parentNotFoundPreload = vi.fn()
    const childNotFoundPreload = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => {
        throw new Error('parent failed')
      },
      onError: () => {
        throw notFound()
      },
      notFoundComponent: { preload: parentNotFoundPreload } as any,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: 'child',
      notFoundComponent: { preload: childNotFoundPreload } as any,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)
    const parentMatch = matches.find(
      (match) => match.routeId === parentRoute.id,
    )!

    await expect(
      loadMatches({ router, location, matches }),
    ).rejects.toMatchObject({ isNotFound: true, routeId: parentRoute.id })

    expect(matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
    ])
    expect(getLaneMatch(matches, parentMatch.id)?.status).toBe('notFound')
    expect(parentNotFoundPreload).toHaveBeenCalledTimes(1)
  })

  test('loader errorComponent preload runs once', async () => {
    const loaderError = new Error('loader failed')
    const errorPreload = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const errorRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/error',
      loader: () => {
        throw loaderError
      },
      errorComponent: { preload: errorPreload } as any,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([errorRoute]),
      history: createMemoryHistory({ initialEntries: ['/error'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)

    await expect(loadMatches({ router, location, matches })).resolves.toBe(
      matches,
    )
    expect(errorPreload).toHaveBeenCalledTimes(1)
  })

  test('loader notFoundComponent preload runs once', async () => {
    const notFoundPreload = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const missingRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/missing',
      loader: () => notFound(),
      notFoundComponent: { preload: notFoundPreload } as any,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([missingRoute]),
      history: createMemoryHistory({ initialEntries: ['/missing'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)

    await expect(
      loadMatches({ router, location, matches }),
    ).rejects.toMatchObject({ isNotFound: true })
    expect(notFoundPreload).toHaveBeenCalledTimes(1)
  })

  test('beforeLoad errorComponent preload runs once', async () => {
    const beforeLoadError = new Error('beforeLoad failed')
    const errorPreload = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const errorRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/error',
      beforeLoad: () => {
        throw beforeLoadError
      },
      errorComponent: { preload: errorPreload } as any,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([errorRoute]),
      history: createMemoryHistory({ initialEntries: ['/error'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)

    await expect(loadMatches({ router, location, matches })).resolves.toBe(
      matches,
    )
    expect(errorPreload).toHaveBeenCalledTimes(1)
  })

  test('beforeLoad notFoundComponent preload runs once', async () => {
    const notFoundPreload = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const missingRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/missing',
      beforeLoad: () => notFound(),
      notFoundComponent: { preload: notFoundPreload } as any,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([missingRoute]),
      history: createMemoryHistory({ initialEntries: ['/missing'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)

    await expect(
      loadMatches({ router, location, matches }),
    ).rejects.toMatchObject({ isNotFound: true })
    expect(notFoundPreload).toHaveBeenCalledTimes(1)
  })

  test('beforeLoad throwing a thenable is committed as a route error', async () => {
    const thenable = { then: vi.fn() }
    const errorPreload = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      beforeLoad: () => {
        throw thenable
      },
      errorComponent: { preload: errorPreload } as any,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/target'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)
    const targetMatch = matches.find(
      (match) => match.routeId === targetRoute.id,
    )!

    await expect(loadMatches({ router, location, matches })).resolves.toBe(
      matches,
    )
    const updatedMatch = getLaneMatch(matches, targetMatch.id)
    expect(updatedMatch?.status).toBe('error')
    expect(updatedMatch?.error).toBe(thenable)
    expect(updatedMatch?._.loadPromise).toBeUndefined()
    expect(errorPreload).toHaveBeenCalledTimes(1)
  })

  test('onError throwing a thenable is committed as a route error', async () => {
    const thenable = { then: vi.fn() }
    const errorPreload = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      ssr: 'data-only',
      loader: () => {
        throw new Error('loader failed')
      },
      onError: () => {
        throw thenable
      },
      errorComponent: { preload: errorPreload } as any,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/target'] }),
      isServer: true,
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)
    const targetMatch = matches.find(
      (match) => match.routeId === targetRoute.id,
    )!

    let result: unknown
    await loadMatches({ router, location, matches }).then(
      () => {
        throw new Error('Expected loadMatches to reject')
      },
      (err) => {
        result = err
      },
    )

    const updatedMatch = getLaneMatch(matches, targetMatch.id)
    expect(result).toBe(thenable)
    expect(updatedMatch?.status).toBe('error')
    expect(updatedMatch?.error).toBe(thenable)
    expect(updatedMatch?._.loadPromise).toBeUndefined()
    expect(errorPreload).toHaveBeenCalledTimes(1)
  })

  test('client load executes head and scripts but never headers', async () => {
    const existingHeaders = { 'x-existing': 'yes' }
    const head = vi.fn(() => ({ meta: [{ title: 'Client' }] }))
    const scripts = vi.fn(() => [{ children: 'client-script' }])
    const headers = vi.fn(() => ({ 'x-new': 'nope' }))
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loader: () => 'loaded',
      head,
      scripts,
      headers,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/target'] }),
      isServer: false,
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    const targetMatch = matches.find(
      (match) => match.routeId === targetRoute.id,
    )!
    targetMatch.headers = existingHeaders
    router.stores.setPending(matches)

    await loadMatches({
      router,
      location,
      matches,
    })
    await projectAssets({ router, matches })
    router.stores.setPending(matches)

    const updatedMatch = router.getMatch(targetMatch.id)
    expect(head).toHaveBeenCalledTimes(1)
    expect(scripts).toHaveBeenCalledTimes(1)
    expect(headers).not.toHaveBeenCalled()
    expect(updatedMatch?.headers).toBe(existingHeaders)
  })

  test('server load executes head, scripts, and headers', async () => {
    const returnedHeaders = { 'x-server': 'yes' }
    const head = vi.fn(() => ({ meta: [{ title: 'Server' }] }))
    const scripts = vi.fn(() => [{ children: 'server-script' }])
    const headers = vi.fn(() => returnedHeaders)
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loader: () => 'loaded',
      head,
      scripts,
      headers,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/target'] }),
      isServer: true,
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)
    const targetMatch = matches.find(
      (match) => match.routeId === targetRoute.id,
    )!

    await loadMatches({
      router,
      location,
      matches,
    })
    router.stores.setPending(matches)

    const updatedMatch = router.getMatch(targetMatch.id)
    expect(head).toHaveBeenCalledTimes(1)
    expect(scripts).toHaveBeenCalledTimes(1)
    expect(headers).toHaveBeenCalledTimes(1)
    expect(updatedMatch?.headers).toBe(returnedHeaders)
  })

  test('navigation owns a separate loadPromise from private pending preload', async () => {
    const loaderGate = createControlledPromise<void>()
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader: async () => {
        await loaderGate
        return 'foo'
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })
    await router.load()

    const preloadPromise = router.preloadRoute({ to: '/foo' })
    await Promise.resolve()
    expect(router.stores.cachedMatches.get()).toEqual([])
    expectNoCachedActiveOverlap(router)

    const navigationPromise = router.navigate({ to: '/foo' })
    await vi.waitFor(() =>
      expect(router.getMatch('/foo/foo', false)).toBeDefined(),
    )
    const navigationMatch = router.getMatch('/foo/foo', false)!
    const loadPromiseB = navigationMatch._.loadPromise!

    expect(loadPromiseB.status).toBe('pending')

    loaderGate.resolve()
    await Promise.all([preloadPromise, navigationPromise])

    const currentMatch = router.getMatch('/foo/foo', false)!
    expect(currentMatch.status).toBe('success')
    expect(currentMatch._.loadPromise).toBeUndefined()
    expectNoCachedActiveOverlap(router)
  })

  test('preload-only work does not arm pendingUntil', async () => {
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      pendingMinMs: 10_000,
      pendingComponent: () => null,
      loader: () => 'target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      defaultPendingMs: 0,
    })

    await router.load()
    const matches = (await router.preloadRoute({ to: '/target' }))!
    const targetMatch = matches.find(
      (match) => match.routeId === targetRoute.id,
    )!

    expect(targetMatch._.loadPromise?.pendingUntil).toBeUndefined()
  })

  test('background reload does not arm pendingUntil', async () => {
    const reloadGate = createControlledPromise<string>()
    let loaderCalls = 0
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      pendingMinMs: 10_000,
      pendingComponent: () => null,
      loader: () => {
        loaderCalls++
        return loaderCalls === 1 ? 'initial' : reloadGate
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/target'] }),
      defaultPendingMs: 0,
    })

    await router.load()
    const targetMatch = router.state.matches.find(
      (match) => match.routeId === targetRoute.id,
    )!
    expect(targetMatch.status).toBe('success')
    expect(targetMatch.loaderData).toBe('initial')

    const reload = router.invalidate()
    await vi.waitFor(() => expect(loaderCalls).toBe(2))

    const reloadingMatch = router.getMatch(targetMatch.id)!
    expect(reloadingMatch.status).toBe('success')
    expect(reloadingMatch._.loadPromise).toBeUndefined()
    expect(reloadingMatch._.loadPromise?.pendingUntil).toBeUndefined()

    reloadGate.resolve('reloaded')
    await reload

    await vi.waitFor(() =>
      expect(router.getMatch(targetMatch.id)?.loaderData).toBe('reloaded'),
    )
  })

  test('reports undefined loader errors in development', async () => {
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loader: async () => {
        throw undefined
      },
      errorComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/target'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)
    const targetMatch = matches.find(
      (match) => match.routeId === targetRoute.id,
    )!

    await expect(
      loadMatches({
        router,
        location,
        matches,
      }),
    ).resolves.toBe(matches)

    const currentMatch = getLaneMatch(matches, targetMatch.id)
    expect(currentMatch?.status).toBe('error')
    expect(currentMatch?.error).toEqual(
      expect.objectContaining({
        message: 'Route load failed with undefined',
      }),
    )
  })

  test.each([
    ['client', false],
    ['server', true],
  ] as const)(
    'keeps a thrown undefined as an error match in production on the %s path',
    async (_label, isServer) => {
      const originalNodeEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      try {
        const rootRoute = new BaseRootRoute({})
        const targetRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/target',
          loader: async () => {
            throw undefined
          },
          errorComponent: () => null,
        })
        const router = createTestRouter({
          routeTree: rootRoute.addChildren([targetRoute]),
          history: createMemoryHistory({ initialEntries: ['/target'] }),
          isServer,
        })
        const location = router.latestLocation
        const matches = router.matchRoutes(location)
        router.stores.setPending(matches)
        const targetMatch = matches.find(
          (match) => match.routeId === targetRoute.id,
        )!

        const result = await loadMatches({
          router,
          location,
          matches,
        }).then(
          () => ({ rejected: false as const }),
          (error) => ({ rejected: true as const, error }),
        )

        const currentMatch = getLaneMatch(matches, targetMatch.id)
        expect(result).toEqual(
          isServer ? { rejected: true, error: undefined } : { rejected: false },
        )
        expect(currentMatch?.status).toBe('error')
        expect(currentMatch?.error).toBeUndefined()
      } finally {
        process.env.NODE_ENV = originalNodeEnv
      }
    },
  )

  test.each([
    ['beforeLoad', 'client', false],
    ['beforeLoad', 'server', true],
    ['loader', 'client', false],
    ['loader', 'server', true],
    ['shouldReload', 'client', false],
  ] as const)(
    'keeps a thrown undefined from %s as a production error match on the %s path',
    async (source, _label, isServer) => {
      const originalNodeEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      try {
        let shouldReloadThrows = false
        const rootRoute = new BaseRootRoute({})
        const targetRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/target',
          beforeLoad:
            source === 'beforeLoad'
              ? () => {
                  throw undefined
                }
              : undefined,
          loader:
            source === 'loader'
              ? () => {
                  throw undefined
                }
              : () => 'loaded',
          shouldReload:
            source === 'shouldReload'
              ? () => {
                  if (shouldReloadThrows) {
                    throw undefined
                  }
                  return true
                }
              : undefined,
          staleTime: Infinity,
          errorComponent: () => null,
        })
        const router = createTestRouter({
          routeTree: rootRoute.addChildren([targetRoute]),
          history: createMemoryHistory({ initialEntries: ['/target'] }),
          isServer,
        })

        if (source === 'shouldReload') {
          await router.load()
          shouldReloadThrows = true
        }

        await router.load({ sync: true })

        const errorMatch = router.state.matches.find(
          (match) => match.routeId === targetRoute.id,
        )
        expect(errorMatch?.status).toBe('error')
        expect(errorMatch?.error).toBeUndefined()
        if (isServer) {
          expect(router.statusCode).toBe(500)
        }
      } finally {
        process.env.NODE_ENV = originalNodeEnv
      }
    },
  )
  ;[
    { name: 'false', value: false },
    { name: '0', value: 0 },
    { name: 'empty string', value: '' },
    { name: 'null', value: null },
  ].forEach(({ name, value }) => {
    test(`wraps falsy validateSearch throw: ${name}`, () => {
      const rootRoute = new BaseRootRoute({})
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
        validateSearch: () => {
          throw value
        },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([targetRoute as any]),
        history: createMemoryHistory({ initialEntries: ['/target'] }),
      })

      expect(() => {
        router.matchRoutes(router.latestLocation, { throwOnError: true })
      }).toThrow(SearchParamError)
      expect(() => {
        router.matchRoutes(router.latestLocation, { throwOnError: true })
      }).toThrow(String(value))
    })

    test(`wraps falsy params parse throw: ${name}`, () => {
      const rootRoute = new BaseRootRoute({})
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target/$id',
        params: {
          parse: () => {
            throw value
          },
        },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([targetRoute as any]),
        history: createMemoryHistory({ initialEntries: ['/target/1'] }),
      })

      expect(() => {
        router.matchRoutes(router.latestLocation, { throwOnError: true })
      }).toThrow(PathParamError)
      expect(() => {
        router.matchRoutes(router.latestLocation, { throwOnError: true })
      }).toThrow(String(value))
    })
  })
  test('early pending onReady receives a stable lane snapshot before final trimming', async () => {
    vi.useFakeTimers()
    try {
      const beforeLoadGate = createControlledPromise<void>()
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        pendingMs: 0,
        pendingComponent: () => null,
        beforeLoad: async () => {
          await beforeLoadGate
          throw new Error('parent failed')
        },
        errorComponent: () => null,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
      })
      const location = router.latestLocation
      const matches = router.matchRoutes(location)
      const initialIds = matches.map((match) => match.id)
      router.stores.setPending(matches)
      const calls: Array<{ ids: Array<string> }> = []

      const loadPromise = loadMatches({
        router,
        location,
        matches,
        onReady: (readyMatches) => {
          calls.push({
            ids: readyMatches.map((match) => match.id),
          })
        },
      })

      await vi.advanceTimersByTimeAsync(0)
      await vi.waitFor(() => expect(calls).toHaveLength(1))

      beforeLoadGate.resolve()
      const loadedMatches = await loadPromise

      expect(calls).toEqual([{ ids: initialIds }])
      expect(loadedMatches.map((match) => match.id)).toEqual(
        matches.slice(0, 2).map((match) => match.id),
      )
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('loadRouteChunk', () => {
  test('partial notFoundComponent preload does not mark all components loaded', async () => {
    const componentPreload = vi.fn()
    const errorPreload = vi.fn()
    const notFoundPreload = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/chunked',
      component: { preload: componentPreload } as any,
      errorComponent: { preload: errorPreload } as any,
      notFoundComponent: { preload: notFoundPreload } as any,
    })

    await loadRouteChunk(route, 'notFoundComponent')

    expect(notFoundPreload).toHaveBeenCalledTimes(1)
    expect(componentPreload).not.toHaveBeenCalled()
    expect(errorPreload).not.toHaveBeenCalled()
    expect((route as any)._componentsLoaded).not.toBe(true)

    await loadRouteChunk(route)

    expect(componentPreload).toHaveBeenCalledTimes(1)
    expect(errorPreload).toHaveBeenCalledTimes(1)
    expect(notFoundPreload).toHaveBeenCalledTimes(2)
    expect((route as any)._componentsLoaded).toBe(true)

    await loadRouteChunk(route)

    expect(componentPreload).toHaveBeenCalledTimes(1)
    expect(errorPreload).toHaveBeenCalledTimes(1)
    expect(notFoundPreload).toHaveBeenCalledTimes(2)
  })

  test('dedupes concurrent full component preloads', async () => {
    let resolveComponent!: () => void
    const componentPreload = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveComponent = resolve
        }),
    )
    const rootRoute = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/chunked',
      component: { preload: componentPreload } as any,
    })

    const first = loadRouteChunk(route)
    const second = loadRouteChunk(route)

    expect(componentPreload).toHaveBeenCalledTimes(1)

    resolveComponent()
    await Promise.all([first, second])

    expect((route as any)._componentsLoaded).toBe(true)

    await loadRouteChunk(route)

    expect(componentPreload).toHaveBeenCalledTimes(1)
  })
})

describe('settle errors do not leak across load generations', () => {
  test('fresh cache hits do not install a loader generation', async () => {
    let router: AnyRouter
    const seenGenerations: Array<ControlledPromise<void> | undefined> = []
    const loader = vi.fn(() => ({ value: 'loaded' }))
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      staleTime: Infinity,
      shouldReload: () => {
        const match = router.getMatch('/foo/foo')
        seenGenerations.push(match?._.loadPromise)
        return false
      },
    })

    router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/foo'] }),
    })

    await router.load()
    await router.load()

    expect(loader).toHaveBeenCalledTimes(1)
    expect(seenGenerations.map((promise) => promise?.status)).toEqual([
      'resolved',
    ])
  })

  test('shouldReload exception commits a route error and trims descendants', async () => {
    const thrown = new Error('shouldReload failed')
    let shouldThrow = false
    const parentLoader = vi.fn(() => ({ value: 'parent' }))
    const childLoader = vi.fn(() => ({ value: 'child' }))
    const childHead = vi.fn(() => ({ meta: [{ title: 'Child' }] }))

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: parentLoader,
      shouldReload: () => {
        if (shouldThrow) {
          throw thrown
        }
        return true
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: childLoader,
      head: childHead,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    await router.load()
    expect(parentLoader).toHaveBeenCalledTimes(1)

    childLoader.mockClear()
    childHead.mockClear()
    shouldThrow = true

    await router.invalidate({ sync: true })

    const parentMatch = router.state.matches.find(
      (match) => match.routeId === parentRoute.id,
    )!

    expect(parentMatch.status).toBe('error')
    expect(parentMatch.error).toBe(thrown)
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
    ])
    expect(childHead).not.toHaveBeenCalled()
  })

  test('does not leave a loader generation when shouldReload throws', async () => {
    const reloadError = new Error('shouldReload failed')
    let shouldThrow = true
    const loader = vi.fn(() => ({ value: 'loaded' }))
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      shouldReload: () => {
        if (shouldThrow) {
          throw reloadError
        }
        return true
      },
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/foo'] }),
    })

    await router.load()
    await router.invalidate({ sync: true })

    const failedMatch = router.state.matches.find(
      (match) => match.routeId === fooRoute.id,
    )!
    expect(failedMatch._.loadPromise).toBeUndefined()

    shouldThrow = false
    await router.invalidate({ sync: true })

    expect(loader).toHaveBeenCalledTimes(2)
    expect(
      router.state.matches.find((match) => match.routeId === fooRoute.id)
        ?.loaderData,
    ).toEqual({ value: 'loaded' })
  })
  ;[
    { name: 'false', value: false },
    { name: '0', value: 0 },
    { name: 'empty string', value: '' },
    { name: 'null', value: null },
    { name: 'undefined', value: undefined },
  ].forEach(({ name, value }) => {
    test(`propagates falsy shouldReload throw: ${name}`, async () => {
      const loader = vi.fn(() => ({ value: 'loaded' }))
      const rootRoute = new BaseRootRoute({})
      const fooRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/foo',
        loader,
        shouldReload: () => {
          throw value
        },
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([fooRoute]),
        history: createMemoryHistory({ initialEntries: ['/foo'] }),
      })

      await router.load()

      const location = router.latestLocation
      const matches = router.matchRoutes(location)
      router.stores.setPending(matches)

      const result = loadMatches({ router, location, matches }).then(
        () => ({ rejected: false, value: undefined }),
        (err) => ({ rejected: true, value: err }),
      )
      const expectedValue =
        value === undefined
          ? expect.objectContaining({
              message: 'Route load failed with undefined',
            })
          : value

      await expect(result).resolves.toEqual({
        rejected: false,
        value: undefined,
      })

      const failedMatch = getLaneMatch(matches, '/foo/foo')
      expect(failedMatch?.status).toBe('error')
      expect(failedMatch?.error).toEqual(expectedValue)
    })
  })
  test('settles the generation when lazy route loading rejects', async () => {
    const lazyError = new Error('lazy failed')
    const lazyGate = createControlledPromise<any>()
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
    }).lazy(() => lazyGate)

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/foo'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)
    const fooMatch = matches.find((match) => match.routeId === fooRoute.id)!

    const load = loadMatches({ router, location, matches }).then(
      () => undefined,
      (err) => err,
    )
    await vi.waitFor(() =>
      expect(router.getMatch(fooMatch.id)?._.loadPromise).toBeDefined(),
    )
    const generation = router.getMatch(fooMatch.id)!._.loadPromise

    lazyGate.reject(lazyError)

    await expect(load).resolves.toBeUndefined()
    expect(generation?.status).toBe('resolved')
    const updatedMatch = getLaneMatch(matches, fooMatch.id)
    expect(updatedMatch?.status).toBe('error')
    expect(updatedMatch?.error).toBe(lazyError)
    expect(updatedMatch?._.loadPromise).toBeUndefined()
    expect(
      updatedMatch?.status === 'pending' && !updatedMatch._.loadPromise,
    ).toBe(false)
  })

  test('settles the generation when errorComponent preload rejects', async () => {
    const componentError = new Error('error component failed')
    const errorGate = createControlledPromise<void>()
    const errorPreload = vi.fn(() => errorGate)
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader: () => {
        throw new Error('loader failed')
      },
      errorComponent: { preload: errorPreload } as any,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/foo'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)
    const fooMatch = matches.find((match) => match.routeId === fooRoute.id)!

    const load = loadMatches({ router, location, matches }).then(
      () => undefined,
      (err) => err,
    )
    await vi.waitFor(() =>
      expect(router.getMatch(fooMatch.id)?._.loadPromise).toBeDefined(),
    )
    const generation = router.getMatch(fooMatch.id)!._.loadPromise

    errorGate.reject(componentError)

    await expect(load).resolves.toBeUndefined()
    expect(generation?.status).toBe('resolved')
    expect(errorPreload).toHaveBeenCalledTimes(1)
    const updatedMatch = getLaneMatch(matches, fooMatch.id)
    expect(updatedMatch?.status).toBe('error')
    expect(updatedMatch?.error).toBe(componentError)
    expect(updatedMatch?._.loadPromise).toBeUndefined()
    expect(
      updatedMatch?.status === 'pending' && !updatedMatch._.loadPromise,
    ).toBe(false)
  })

  test('settles the generation when notFoundComponent preload rejects', async () => {
    const componentError = new Error('notFound component failed')
    const notFoundGate = createControlledPromise<void>()
    const notFoundPreload = vi.fn(() => notFoundGate)
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader: () => notFound(),
      notFoundComponent: { preload: notFoundPreload } as any,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/foo'] }),
    })
    const location = router.latestLocation
    const matches = router.matchRoutes(location)
    router.stores.setPending(matches)
    const fooMatch = matches.find((match) => match.routeId === fooRoute.id)!

    const load = loadMatches({ router, location, matches }).then(
      () => undefined,
      (err) => err,
    )
    await vi.waitFor(() =>
      expect(router.getMatch(fooMatch.id)?._.loadPromise).toBeDefined(),
    )
    const generation = router.getMatch(fooMatch.id)!._.loadPromise

    notFoundGate.reject(componentError)

    await expect(load).resolves.toBeUndefined()
    expect(generation?.status).toBe('resolved')
    expect(notFoundPreload).toHaveBeenCalledTimes(1)
    const updatedMatch = getLaneMatch(matches, fooMatch.id)
    expect(updatedMatch?.status).toBe('error')
    expect(updatedMatch?.error).toBe(componentError)
    expect(updatedMatch?._.loadPromise).toBeUndefined()
    expect(
      updatedMatch?.status === 'pending' && !updatedMatch._.loadPromise,
    ).toBe(false)
  })

  test('navigation updates cached matches once during commit', async () => {
    const loaderGate = createControlledPromise<string>()
    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader: () => 'foo',
    })
    const barRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bar',
      loader: () => loaderGate,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute, barRoute]),
      history: createMemoryHistory({ initialEntries: ['/foo'] }),
    })
    await router.load()

    const setCached = vi.spyOn(router.stores, 'setCached')
    try {
      const navigation = router.navigate({ to: '/bar' })
      await vi.waitFor(() =>
        expect(
          router.stores.pendingMatches
            .get()
            .some((match) => match.routeId === barRoute.id),
        ).toBe(true),
      )
      const setCachedAfterPending = setCached.mock.calls.length

      loaderGate.resolve('bar')
      await navigation

      expect(setCached).toHaveBeenCalledTimes(setCachedAfterPending + 1)
      expect(
        router.stores.cachedMatches
          .get()
          .some((match) => match.routeId === fooRoute.id),
      ).toBe(true)
    } finally {
      setCached.mockRestore()
    }
  })

  test('internal updateMatch ignores cached match stores', async () => {
    const rootRoute = new BaseRootRoute({})
    const cachedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/cached',
      loader: () => 'cached',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([cachedRoute]),
      history: createMemoryHistory(),
    })
    await router.load()
    await router.preloadRoute({ to: '/cached' })

    const cachedMatch = router.stores.cachedMatches
      .get()
      .find((match) => match.routeId === cachedRoute.id)!

    router.updateMatch(cachedMatch.id, (match) => ({
      ...match,
      status: 'pending',
      error: new Error('should not write through updateMatch'),
    }))

    const currentCachedMatch = router.stores.cachedMatches
      .get()
      .find((match) => match.routeId === cachedRoute.id)!
    expect(currentCachedMatch).toBe(cachedMatch)
    expect(currentCachedMatch.status).toBe('success')
    expect(currentCachedMatch.error).toBeUndefined()
  })

  test('invalidate forcePending keeps cached matches as invalid success snapshots', async () => {
    let calls = 0
    const loader = vi.fn(() => ({ value: ++calls }))
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const cachedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/cached',
      loader,
      staleTime: Infinity,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, cachedRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/cached' })
    expect(loader).toHaveBeenCalledTimes(1)

    await router.invalidate({ forcePending: true, sync: true })

    const cachedMatch = router.stores.cachedMatches
      .get()
      .find((match) => match.routeId === cachedRoute.id)!
    expect(cachedMatch.status).toBe('success')
    expect(cachedMatch.invalid).toBe(true)
    expect(
      router.stores.cachedMatches
        .get()
        .every((match) => match.status === 'success'),
    ).toBe(true)

    await router.navigate({ to: '/cached' })

    const activeMatch = router.state.matches.find(
      (match) => match.routeId === cachedRoute.id,
    )!
    expect(loader).toHaveBeenCalledTimes(2)
    expect(activeMatch.loaderData).toEqual({ value: 2 })
    expect(activeMatch.invalid).toBe(false)
  })

  test('successful preload cache entry expires and is evicted', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)

    try {
      const rootRoute = new BaseRootRoute({})
      const preloadRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/preload',
        loader: () => 'preload',
        preloadGcTime: 10,
      })
      const nextRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/next',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([preloadRoute, nextRoute]),
        history: createMemoryHistory(),
      })

      await router.load()
      await router.preloadRoute({ to: '/preload' })

      const preloadMatch = router.stores.cachedMatches
        .get()
        .find((match) => match.routeId === preloadRoute.id)!

      vi.setSystemTime(1_011)
      await router.navigate({ to: '/next' })

      expect(
        router.stores.cachedMatches
          .get()
          .some((match) => match.routeId === preloadRoute.id),
      ).toBe(false)
      expect(preloadMatch.status).toBe('success')
    } finally {
      vi.useRealTimers()
    }
  })

  test('successful navigation cache entry expires and is evicted', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)

    try {
      const rootRoute = new BaseRootRoute({})
      const cachedRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/cached',
        loader: () => 'cached',
        gcTime: 10,
      })
      const nextRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/next',
      })
      const otherRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([cachedRoute, nextRoute, otherRoute]),
        history: createMemoryHistory({ initialEntries: ['/cached'] }),
      })

      await router.load()
      await router.navigate({ to: '/next' })

      expect(
        router.stores.cachedMatches
          .get()
          .some((match) => match.routeId === cachedRoute.id),
      ).toBe(true)

      vi.setSystemTime(1_011)
      await router.navigate({ to: '/other' })

      expect(
        router.stores.cachedMatches
          .get()
          .some((match) => match.routeId === cachedRoute.id),
      ).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  test('a stale redirect resolving after a newer navigation does not navigate or update redirect state', async () => {
    const slowBeforeLoadStarted = vi.fn()
    const slowBeforeLoadGate = createControlledPromise<void>()

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const slowRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/slow',
      beforeLoad: async () => {
        slowBeforeLoadStarted()
        await slowBeforeLoadGate
        throw redirect({ to: '/redirected' })
      },
    })
    const safeRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/safe',
    })
    const redirectedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/redirected',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        slowRoute,
        safeRoute,
        redirectedRoute,
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()

    const staleNavigation = router.navigate({ to: '/slow' })
    await vi.waitFor(() => expect(slowBeforeLoadStarted).toHaveBeenCalled())

    await router.navigate({ to: '/safe' })
    expect(router.state.location.pathname).toBe('/safe')

    slowBeforeLoadGate.resolve()
    await staleNavigation

    expect(router.state.location.pathname).toBe('/safe')
    expect(router.redirect).toBeUndefined()
  })

  test('notFound preload is evicted and does not affect a later navigation', async () => {
    let calls = 0
    const loader = vi.fn(async () => {
      calls++
      if (calls === 1) {
        throw notFound()
      }

      return { value: 'fresh' }
    })

    const rootRoute = new BaseRootRoute({})
    const staleRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/stale',
      loader,
      staleTime: 0,
      gcTime: 60_000,
    })
    const routeTree = rootRoute.addChildren([staleRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })
    await router.load()

    await router.preloadRoute({ to: '/stale' })
    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.routeId === staleRoute.id),
    ).toBe(false)

    await router.navigate({ to: '/stale' })

    const match = router.state.matches.find((m) => m.routeId === staleRoute.id)!
    expect(loader).toHaveBeenCalledTimes(2)
    expect(match.status).toBe('success')
    expect(match.loaderData).toEqual({ value: 'fresh' })
  })

  test('redirecting preload is not cached and does not poison a later navigation', async () => {
    let calls = 0
    const loader = vi.fn(async () => {
      calls++
      if (calls === 1) {
        throw redirect({ to: '/other' })
      }

      return { value: 'fresh' }
    })

    const rootRoute = new BaseRootRoute({})
    const staleRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/stale',
      loader,
      staleTime: 0,
      gcTime: 60_000,
    })
    const otherRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
    })
    const routeTree = rootRoute.addChildren([staleRoute, otherRoute])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory(),
    })
    await router.load()

    await router.preloadRoute({ to: '/stale' })
    expect(loader).toHaveBeenCalledTimes(1)
    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.routeId === staleRoute.id),
    ).toBe(false)

    await router.navigate({ to: '/stale' })

    expect(router.state.location.pathname).toBe('/stale')
    const match = router.state.matches.find((m) => m.routeId === staleRoute.id)!
    expect(loader).toHaveBeenCalledTimes(2)
    expect(match.status).toBe('success')
    expect(match.loaderData).toEqual({ value: 'fresh' })
  })
})

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
