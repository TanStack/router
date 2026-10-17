import { createMemoryHistory } from '@tanstack/history'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  BaseRootRoute,
  BaseRoute,
  isNotFound,
  isRedirect,
  notFound,
  redirect,
} from '../src'
import {
  attachRouterServerSsrUtils,
  dehydrateMatch,
} from '../src/ssr/ssr-server'
import { dehydrateSsrMatchId } from '../src/ssr/ssr-match-id'
import {
  createTestRouter,
  dehydrateToBootstrap,
  loadServerResponse,
} from './routerTestUtils'
import type { AnyRoute, AnyRouteMatch, AnyRouter } from '../src'

/**
 * Server half of the lifecycle transport protocol: the object form is
 * unwrapped, `context` may be async and receives `additionalContext`, and at
 * settle time each transported lifecycle result (after a custom `dehydrate`)
 * lands under `match._dehydrated.{m,b,l}`. The key is present iff the
 * lifecycle ran and was transported, `undefined` included; `dehydrateMatch`
 * emits by key presence.
 */

function createServerRouter(
  routeTree: AnyRoute,
  path: string,
  options: Record<string, unknown> = {},
) {
  return createTestRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    isServer: true,
    ...options,
  })
}

function matchOf(router: AnyRouter, route: AnyRoute): AnyRouteMatch {
  const match = router.state.matches.find((m) => m.routeId === route.id)
  expect(match).toBeDefined()
  return match!
}

/** The matches a server router sends; `u` is the load time, so it is dropped. */
async function sentMatches(router: AnyRouter) {
  const bootstrap = await dehydrateToBootstrap(router, { routes: {} })
  return bootstrap.router!.matches.map(({ u: _u, ...match }) => match)
}

function wireKeys(match: AnyRouteMatch): Array<string> {
  return Object.keys(match._dehydrated ?? {}).sort()
}

describe('object form unwrap', () => {
  test('context, beforeLoad and loader run their handler', async () => {
    const rootRoute = new BaseRootRoute({
      context: { handler: () => ({ a: 1 }) },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/child',
      beforeLoad: { handler: ({ context }) => ({ b: context.a + 1 }) },
      loader: { handler: ({ context }) => context.a + context.b },
    })
    const router = createServerRouter(
      rootRoute.addChildren([childRoute]),
      '/child',
    )

    await router.load()

    expect(matchOf(router, rootRoute)).toMatchObject({
      status: 'success',
      context: { a: 1 },
    })
    expect(matchOf(router, childRoute)).toMatchObject({
      status: 'success',
      context: { a: 1, b: 2 },
      loaderData: 3,
    })
  })
})

describe('context lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('a sync context contributes to the match context and keeps success status', async () => {
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: () => ({ page: 'yes' }),
    })
    const router = createServerRouter(
      rootRoute.addChildren([pageRoute]),
      '/page',
    )

    await router.load()

    const match = matchOf(router, pageRoute)
    expect(match.status).toBe('success')
    expect(match.context).toEqual({ page: 'yes' })
    expect(match._dehydrated).toBeUndefined()
  })

  test('an async context is awaited before its own beforeLoad and the child context run', async () => {
    // Both contexts are async and not transported, so the dev warning
    // fires for each; it has its own describe below and is silenced here.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const order: Array<string> = []
    const rootRoute = new BaseRootRoute({
      context: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        order.push('root.context')
        return { session: 'user-1' }
      },
      beforeLoad: ({ context }) => {
        order.push(`root.beforeLoad:${context.session}`)
        return { rootGuard: context.session }
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/child',
      context: {
        handler: async ({ context }) => {
          order.push(`child.context:${context.session}:${context.rootGuard}`)
          return { child: `${context.session}:child` }
        },
      },
      beforeLoad: ({ context }) => {
        order.push(`child.beforeLoad:${context.child}`)
      },
      loader: ({ context }) => context.child,
    })
    const router = createServerRouter(
      rootRoute.addChildren([childRoute]),
      '/child',
    )

    await router.load()

    expect(order).toEqual([
      'root.context',
      'root.beforeLoad:user-1',
      'child.context:user-1:user-1',
      'child.beforeLoad:user-1:child',
    ])
    expect(matchOf(router, rootRoute).context).toEqual({
      session: 'user-1',
      rootGuard: 'user-1',
    })
    expect(matchOf(router, childRoute)).toMatchObject({
      context: {
        session: 'user-1',
        rootGuard: 'user-1',
        child: 'user-1:child',
      },
      loaderData: 'user-1:child',
    })
  })

  test('context receives additionalContext like beforeLoad and loader', async () => {
    const serverContext = { requestId: 'req-1' }
    const contextFn = vi.fn(() => ({ fromContext: true }))
    const beforeLoadFn = vi.fn(() => ({ fromBeforeLoad: true }))
    const loaderFn = vi.fn(() => 'data')
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: contextFn,
      beforeLoad: beforeLoadFn,
      loader: loaderFn,
    })
    const router = createServerRouter(
      rootRoute.addChildren([pageRoute]),
      '/page',
      { additionalContext: { serverContext } },
    )

    await router.load()

    for (const fn of [contextFn, beforeLoadFn, loaderFn]) {
      expect(fn).toHaveBeenCalledWith(
        expect.objectContaining({ serverContext, preload: false }),
      )
    }
    expect(contextFn).toHaveBeenCalledWith(
      expect.objectContaining({
        params: {},
        context: {},
        routeId: pageRoute.id,
        cause: 'enter',
      }),
    )
  })
})

describe('transport decisions', () => {
  test('defaults: context is not transported, beforeLoad and loader are', async () => {
    const rootRoute = new BaseRootRoute({})
    const fnRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/fn',
      context: () => ({ ctx: 'fn' }),
      beforeLoad: () => ({ guard: 'fn' }),
      loader: () => 'fn data',
    })
    const objectRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/object',
      context: { handler: () => ({ ctx: 'object' }) },
      beforeLoad: { handler: () => ({ guard: 'object' }) },
      loader: { handler: () => 'object data' },
    })
    const routeTree = rootRoute.addChildren([fnRoute, objectRoute])

    const fnRouter = createServerRouter(routeTree, '/fn')
    await fnRouter.load()
    const fnMatch = matchOf(fnRouter, fnRoute)
    expect(wireKeys(fnMatch)).toEqual(['b', 'l'])
    expect(fnMatch._dehydrated).toEqual({ b: { guard: 'fn' }, l: 'fn data' })
    expect(fnMatch.context).toEqual({ ctx: 'fn', guard: 'fn' })

    const objectRouter = createServerRouter(routeTree, '/object')
    await objectRouter.load()
    const objectMatch = matchOf(objectRouter, objectRoute)
    expect(wireKeys(objectMatch)).toEqual(['b', 'l'])
    expect(objectMatch._dehydrated).toEqual({
      b: { guard: 'object' },
      l: 'object data',
    })
  })

  test('a route without lifecycles has no wire keys', async () => {
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
    })
    const router = createServerRouter(
      rootRoute.addChildren([pageRoute]),
      '/page',
    )

    await router.load()

    expect(matchOf(router, rootRoute)._dehydrated).toBeUndefined()
    expect(matchOf(router, pageRoute)._dehydrated).toBeUndefined()
  })

  test('dehydrate: true transports the context contribution', async () => {
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: {
        handler: () => ({ session: 'user-1' }),
        dehydrate: true,
      },
    })
    const router = createServerRouter(
      rootRoute.addChildren([pageRoute]),
      '/page',
    )

    await router.load()

    const match = matchOf(router, pageRoute)
    expect(wireKeys(match)).toEqual(['m'])
    expect(match._dehydrated!.m).toEqual({ session: 'user-1' })
  })

  test('an explicit dehydrate: true on beforeLoad and loader transports like the default', async () => {
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      beforeLoad: { handler: () => ({ guard: 1 }), dehydrate: true },
      loader: { handler: () => 'data', dehydrate: true },
    })
    const router = createServerRouter(
      rootRoute.addChildren([pageRoute]),
      '/page',
    )

    await router.load()

    const match = matchOf(router, pageRoute)
    expect(match._dehydrated).toEqual({ b: { guard: 1 }, l: 'data' })
    expect(match._dehydrated!.l).toBe(match.loaderData)
  })

  test('dehydrate: false omits the key but the server still runs the lifecycle', async () => {
    const contextHandler = vi.fn(() => ({ session: 'user-1' }))
    const beforeLoadHandler = vi.fn(() => ({ guard: true }))
    const loaderHandler = vi.fn(() => 'data')
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: { handler: contextHandler, dehydrate: false },
      beforeLoad: { handler: beforeLoadHandler, dehydrate: false },
      loader: { handler: loaderHandler, dehydrate: false },
    })
    const router = createServerRouter(
      rootRoute.addChildren([pageRoute]),
      '/page',
    )

    await router.load()

    expect(contextHandler).toHaveBeenCalledOnce()
    expect(beforeLoadHandler).toHaveBeenCalledOnce()
    expect(loaderHandler).toHaveBeenCalledOnce()
    const match = matchOf(router, pageRoute)
    expect(match).toMatchObject({
      status: 'success',
      context: { session: 'user-1', guard: true },
      loaderData: 'data',
    })
    expect(match._dehydrated).toBeUndefined()
    const dehydrated = dehydrateMatch(match)
    expect(dehydrated).not.toHaveProperty('m')
    expect(dehydrated).not.toHaveProperty('b')
    expect(dehydrated).not.toHaveProperty('l')
  })

  test('an async context with dehydrate: true and revalidate: true is transported; revalidate has no server effect', async () => {
    let session: { userId: string } | null = { userId: 'u1' }
    const getSession = vi.fn(async () => session)
    const rootRoute = new BaseRootRoute({
      context: {
        handler: async () => ({ session: await getSession() }),
        dehydrate: true,
        revalidate: true,
      },
      beforeLoad: ({ context }) => {
        if (!context.session) {
          throw redirect({ to: '/login' })
        }
      },
    })
    const loginRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/login',
    })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader: ({ context }) => context.session!.userId,
    })
    const routeTree = rootRoute.addChildren([loginRoute, pageRoute])

    const signedIn = createServerRouter(routeTree, '/page')
    const bootstrap = await dehydrateToBootstrap(signedIn, { routes: {} })
    expect(getSession).toHaveBeenCalledOnce()
    const root = matchOf(signedIn, rootRoute)
    expect(root.context).toEqual({ session: { userId: 'u1' } })
    expect(root._dehydrated).toEqual({
      m: { session: { userId: 'u1' } },
      b: undefined,
    })
    expect(bootstrap.router!.matches[0]).toMatchObject({
      m: { session: { userId: 'u1' } },
    })
    expect(bootstrap.router!.matches[0]).toHaveProperty('b', undefined)
    expect(matchOf(signedIn, pageRoute).loaderData).toBe('u1')

    session = null
    const signedOut = createServerRouter(routeTree, '/page')
    const response = await loadServerResponse(signedOut, '/page')
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/login')
    expect(getSession).toHaveBeenCalledTimes(2)
  })

  test('an undefined result keeps the key', async () => {
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: { handler: () => undefined, dehydrate: true },
      beforeLoad: () => {},
      loader: () => undefined,
    })
    const router = createServerRouter(
      rootRoute.addChildren([pageRoute]),
      '/page',
    )

    await router.load()

    const match = matchOf(router, pageRoute)
    expect(wireKeys(match)).toEqual(['b', 'l', 'm'])
    expect(match._dehydrated).toHaveProperty('m', undefined)
    expect(match._dehydrated).toHaveProperty('b', undefined)
    expect(match._dehydrated).toHaveProperty('l', undefined)
    const dehydrated = dehydrateMatch(match)
    expect(Object.keys(dehydrated).sort()).toEqual([
      'b',
      'i',
      'l',
      'm',
      's',
      'ssr',
      'u',
    ])
  })

  test('ssr: false runs nothing and emits no key; data-only still transports', async () => {
    const skippedContext = vi.fn(() => ({ ctx: true }))
    const skippedBeforeLoad = vi.fn(() => ({ guard: true }))
    const skippedLoader = vi.fn(() => 'skipped')
    const head = vi.fn(({ match }: { match: AnyRouteMatch }) => ({
      meta: [{ title: String(match.context.ctx) }],
    }))
    const rootRoute = new BaseRootRoute({
      context: () => ({ inherited: true }),
    })
    const clientOnlyRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/client-only',
      ssr: false,
      context: { handler: skippedContext, dehydrate: true },
      beforeLoad: skippedBeforeLoad,
      loader: skippedLoader,
      head,
    })
    const dataOnlyRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/data-only',
      ssr: 'data-only',
      context: { handler: () => ({ ctx: true }), dehydrate: true },
      beforeLoad: () => ({ guard: true }),
      loader: () => 'data',
    })
    const routeTree = rootRoute.addChildren([clientOnlyRoute, dataOnlyRoute])

    const clientOnlyRouter = createServerRouter(routeTree, '/client-only')
    await clientOnlyRouter.load()
    // `context` is skipped like the other two lifecycles, so the server-side
    // `head` of an `ssr: false` match sees only the inherited context. The
    // client runs it at hydration.
    expect(skippedContext).not.toHaveBeenCalled()
    expect(skippedBeforeLoad).not.toHaveBeenCalled()
    expect(skippedLoader).not.toHaveBeenCalled()
    const clientOnlyMatch = matchOf(clientOnlyRouter, clientOnlyRoute)
    expect(clientOnlyMatch.ssr).toBe(false)
    expect(clientOnlyMatch.status).toBe('pending')
    expect(clientOnlyMatch.context).toEqual({ inherited: true })
    expect(head).toHaveBeenCalledOnce()
    expect(clientOnlyMatch.meta).toEqual([{ title: 'undefined' }])
    expect(wireKeys(clientOnlyMatch)).toEqual([])
    const dehydratedClientOnly = dehydrateMatch(clientOnlyMatch)
    expect(Object.keys(dehydratedClientOnly).sort()).toEqual([
      'i',
      's',
      'ssr',
      'u',
    ])

    const dataOnlyRouter = createServerRouter(routeTree, '/data-only')
    await dataOnlyRouter.load()
    const dataOnlyMatch = matchOf(dataOnlyRouter, dataOnlyRoute)
    expect(dataOnlyMatch.ssr).toBe('data-only')
    expect(dataOnlyMatch._dehydrated).toEqual({
      m: { ctx: true },
      b: { guard: true },
      l: 'data',
    })
  })

  test('a throwing handler leaves no key for that lifecycle or the ones after it', async () => {
    const rootRoute = new BaseRootRoute({})
    const contextError = new Error('context failed')
    const contextRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/context',
      context: {
        handler: () => {
          throw contextError
        },
        dehydrate: true,
      },
      beforeLoad: () => ({ guard: true }),
      loader: () => 'data',
      errorComponent: () => null,
    })
    const beforeLoadError = new Error('beforeLoad failed')
    const beforeLoadRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/before-load',
      beforeLoad: () => {
        throw beforeLoadError
      },
      loader: () => 'data',
      errorComponent: () => null,
    })
    const loaderError = new Error('loader failed')
    const loaderRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/loader',
      beforeLoad: () => ({ guard: true }),
      loader: () => {
        throw loaderError
      },
      errorComponent: () => null,
    })
    const routeTree = rootRoute.addChildren([
      contextRoute,
      beforeLoadRoute,
      loaderRoute,
    ])

    const contextRouter = createServerRouter(routeTree, '/context')
    await contextRouter.load()
    const contextMatch = matchOf(contextRouter, contextRoute)
    expect(contextMatch).toMatchObject({ status: 'error', error: contextError })
    expect(wireKeys(contextMatch)).toEqual([])

    const beforeLoadRouter = createServerRouter(routeTree, '/before-load')
    await beforeLoadRouter.load()
    const beforeLoadMatch = matchOf(beforeLoadRouter, beforeLoadRoute)
    expect(beforeLoadMatch).toMatchObject({
      status: 'error',
      error: beforeLoadError,
    })
    expect(wireKeys(beforeLoadMatch)).toEqual([])

    const loaderRouter = createServerRouter(routeTree, '/loader')
    await loaderRouter.load()
    const loaderMatch = matchOf(loaderRouter, loaderRoute)
    expect(loaderMatch).toMatchObject({ status: 'error', error: loaderError })
    expect(wireKeys(loaderMatch)).toEqual(['b'])
    expect(dehydrateMatch(loaderMatch)).toMatchObject({
      s: 'error',
      e: loaderError,
      b: { guard: true },
    })
    expect(dehydrateMatch(loaderMatch)).not.toHaveProperty('l')
  })

  test('a redirect thrown from an async context handler is control flow', async () => {
    const onError = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const loginRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/login',
    })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: {
        handler: async () => {
          await Promise.resolve()
          throw redirect({ to: '/login' })
        },
        dehydrate: true,
      },
      onError,
    })
    const router = createServerRouter(
      rootRoute.addChildren([loginRoute, pageRoute]),
      '/page',
    )

    const response = await loadServerResponse(router, '/page')

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/login')
    expect(router._serverResult?.type).toBe('redirect')
    expect(onError).not.toHaveBeenCalled()
  })

  test('a reused server router does not leak wire keys from a previous load', async () => {
    // `matchRoutes` spreads the previous match objects on a reused router, so
    // the lane must reset `_dehydrated` or a stale `l` from load 1 would be
    // emitted after load 2 failed in its loader.
    let contextRuns = 0
    let loaderRuns = 0
    const boom = new Error('second load fails')
    const rootRoute = new BaseRootRoute({
      context: { handler: () => ({ run: ++contextRuns }), dehydrate: true },
    })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      beforeLoad: () => ({ guard: loaderRuns }),
      loader: () => {
        loaderRuns++
        if (loaderRuns === 2) {
          throw boom
        }
        return `data-${loaderRuns}`
      },
      errorComponent: () => null,
    })
    const router = createServerRouter(
      rootRoute.addChildren([pageRoute]),
      '/page',
    )

    await router.load()
    expect(matchOf(router, rootRoute)._dehydrated).toEqual({ m: { run: 1 } })
    expect(matchOf(router, pageRoute)._dehydrated).toEqual({
      b: { guard: 0 },
      l: 'data-1',
    })

    await router.load()
    const root = matchOf(router, rootRoute)
    expect(root.context).toEqual({ run: 2 })
    expect(root._dehydrated).toEqual({ m: { run: 2 } })
    const page = matchOf(router, pageRoute)
    expect(page).toMatchObject({ status: 'error', error: boom })
    expect(page._dehydrated).toEqual({ b: { guard: 1 } })
    const dehydrated = dehydrateMatch(page)
    expect(dehydrated).toMatchObject({ s: 'error', e: boom, b: { guard: 1 } })
    expect(dehydrated).not.toHaveProperty('l')
    expect(dehydrated).not.toHaveProperty('m')
  })

  test('a reused server router renders and sends the same failure as a fresh router', async () => {
    let load = 1
    const parentError = new Error('parent fails late')
    const childError = new Error('child fails first')
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/a',
      loader: async () => {
        if (load === 2) {
          await new Promise((resolve) => setTimeout(resolve, 5))
          throw parentError
        }
        return `a-${load}`
      },
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/b',
      loader: () => {
        if (load === 2) {
          throw childError
        }
        return `b-${load}`
      },
      errorComponent: () => null,
    })
    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
    ])
    const reused = createServerRouter(routeTree, '/a/b')
    await reused.load()
    expect(matchOf(reused, parentRoute).loaderData).toBe('a-1')

    load = 2
    await reused.load()
    const fresh = createServerRouter(routeTree, '/a/b')
    await fresh.load()

    for (const router of [reused, fresh]) {
      const parent = matchOf(router, parentRoute)
      expect(parent).toMatchObject({ status: 'error', error: parentError })
      expect(parent.loaderData).toBeUndefined()
      expect(dehydrateMatch(parent)).not.toHaveProperty('l')
    }
  })

  test.each([
    ['succeeded', false],
    ['failed', true],
  ])(
    'a reused server router sends the same payload as a fresh router when a parent beforeLoad fails (child %s on load 1)',
    async (_, childThrows) => {
      let load = 1
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/a',
        beforeLoad: () => {
          if (load === 2) {
            throw new Error('parent guard fails on load 2')
          }
        },
        loader: () => `a-${load}`,
        errorComponent: () => null,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/b',
        loader: () => {
          if (childThrows) {
            throw new Error('child fails on load 1')
          }
          return `b-${load}`
        },
        errorComponent: () => null,
      })
      const routeTree = rootRoute.addChildren([
        parentRoute.addChildren([childRoute]),
      ])
      const reused = createServerRouter(routeTree, '/a/b')
      await reused.load()
      expect(matchOf(reused, childRoute).status).toBe(
        childThrows ? 'error' : 'success',
      )

      load = 2
      const sent = await sentMatches(reused)
      expect(sent).toEqual(
        await sentMatches(createServerRouter(routeTree, '/a/b')),
      )
      expect(sent.map((match) => match.s)).toEqual(['success', 'error'])
    },
  )

  test.each([
    ['succeeded', false],
    ['failed', true],
  ])(
    'a reused server router sends the same payload as a fresh router when a match turns ssr: false (load 1 %s)',
    async (_, loadOneThrows) => {
      let load = 1
      const rootRoute = new BaseRootRoute({})
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        ssr: () => load === 1,
        loader: () => {
          if (loadOneThrows) {
            throw new Error('page fails on load 1')
          }
          return `page-${load}`
        },
        errorComponent: () => null,
      })
      const routeTree = rootRoute.addChildren([pageRoute])
      const reused = createServerRouter(routeTree, '/page')
      await reused.load()
      expect(matchOf(reused, pageRoute).status).toBe(
        loadOneThrows ? 'error' : 'success',
      )

      load = 2
      const sent = await sentMatches(reused)
      expect(sent).toEqual(
        await sentMatches(createServerRouter(routeTree, '/page')),
      )
      expect(sent.map(({ s, ssr, e }) => ({ s, ssr, e }))).toEqual([
        { s: 'success', ssr: true, e: undefined },
        { s: 'pending', ssr: false, e: undefined },
      ])
    },
  )

  test('a reused server router passes `ssr` the same matches as a fresh router', async () => {
    const seen: Array<Array<unknown>> = []
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/a',
      ssr: ({ matches }) => {
        seen.push(matches.map((match) => match.ssr))
        return true
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/b',
      ssr: 'data-only',
    })
    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
    ])
    const reused = createServerRouter(routeTree, '/a/b')
    await reused.load()
    expect(matchOf(reused, childRoute).ssr).toBe('data-only')

    await reused.load()
    await createServerRouter(routeTree, '/a/b').load()
    // The child's policy is not resolved yet when the parent's runs.
    expect(seen).toEqual([
      [true, true, undefined],
      [true, true, undefined],
      [true, true, undefined],
    ])
  })

  test('a reused server router drops the previous head and headers when they fail', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    let load = 1
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      head: () => {
        if (load === 2) {
          throw new Error('head fails on load 2')
        }
        return { meta: [{ title: 'load 1' }] }
      },
      headers: () => ({ 'x-load': String(load) }),
    })
    const router = createServerRouter(
      rootRoute.addChildren([pageRoute]),
      '/page',
    )
    try {
      const first = await loadServerResponse(router, '/page')
      expect(first.headers.get('x-load')).toBe('1')
      expect(matchOf(router, pageRoute).meta).toEqual([{ title: 'load 1' }])

      load = 2
      const second = await loadServerResponse(router, '/page')
      // A failed head drops all three results, as on a fresh router.
      expect(second.headers.get('x-load')).toBeNull()
      expect(matchOf(router, pageRoute).meta).toBeUndefined()
      expect(consoleError).toHaveBeenCalledOnce()
    } finally {
      consoleError.mockRestore()
    }
  })

  test('a loader dehydrate does not run once a sibling redirected the lane', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const loaderDehydrate = vi.fn(({ data }: { data: string }) => data)
    const parentLoader = vi.fn(async () => {
      await gate
      return 'parent'
    })
    const rootRoute = new BaseRootRoute({})
    const loginRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/login',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: {
        handler: parentLoader,
        dehydrate: loaderDehydrate,
        hydrate: ({ data }) => data,
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: () => {
        throw redirect({ to: '/login' })
      },
    })
    const router = createServerRouter(
      rootRoute.addChildren([
        loginRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      '/parent/child',
    )

    // The child's redirect decides the response while the parent loader is
    // still pending; the parent settles afterwards on an abandoned lane.
    const response = await loadServerResponse(router, '/parent/child')
    expect(response.status).toBe(307)
    expect(parentLoader).toHaveBeenCalledOnce()
    expect(loaderDehydrate).not.toHaveBeenCalled()

    release()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(loaderDehydrate).not.toHaveBeenCalled()
  })
})

describe('custom dehydrate', () => {
  test('a sync dehydrate transforms m, b and l and receives the handler ctx plus data', async () => {
    const serverContext = { requestId: 'req-1' }
    const contextDehydrate = vi.fn(
      ({ data }: { data: { id: string; secret: string } }) => ({
        id: data.id,
      }),
    )
    const beforeLoadDehydrate = vi.fn(
      ({ data }: { data: { user: { name: string; token: string } } }) =>
        data.user.name,
    )
    const loaderDehydrate = vi.fn(
      ({ data }: { data: { report: string; raw: Array<number> } }) =>
        data.report,
    )
    const rootRoute = new BaseRootRoute({
      context: () => ({ root: true }),
    })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page/$postId',
      validateSearch: (search: Record<string, unknown>) => ({
        q: String(search.q ?? ''),
      }),
      loaderDeps: ({ search }) => ({ q: search.q }),
      context: {
        handler: ({ params }) => ({ id: params.postId, secret: 'server' }),
        dehydrate: contextDehydrate,
        hydrate: ({ data }) => ({ id: data.id, secret: 'client' }),
      },
      beforeLoad: {
        handler: () => ({ user: { name: 'ada', token: 't0k3n' } }),
        dehydrate: beforeLoadDehydrate,
        hydrate: ({ data }) => ({ user: { name: data, token: '' } }),
      },
      loader: {
        handler: () => ({ report: 'summary', raw: [1, 2, 3] }),
        dehydrate: loaderDehydrate,
        hydrate: ({ data }) => ({ report: data, raw: [] }),
      },
    })
    const router = createServerRouter(
      rootRoute.addChildren([pageRoute]),
      '/page/p1?q=term',
      { additionalContext: { serverContext } },
    )

    await router.load()

    const match = matchOf(router, pageRoute)
    expect(match.status).toBe('success')
    // Full values stay on the match for rendering.
    expect(match.context).toEqual({
      root: true,
      id: 'p1',
      secret: 'server',
      user: { name: 'ada', token: 't0k3n' },
    })
    expect(match.loaderData).toEqual({ report: 'summary', raw: [1, 2, 3] })
    // The wire holds the dehydrated shape.
    expect(match._dehydrated).toEqual({
      m: { id: 'p1' },
      b: 'ada',
      l: 'summary',
    })
    expect(dehydrateMatch(match)).toMatchObject({
      m: { id: 'p1' },
      b: 'ada',
      l: 'summary',
    })

    // Each dehydrate receives the same ctx as its handler, plus `data`.
    expect(contextDehydrate).toHaveBeenCalledOnce()
    expect(contextDehydrate.mock.calls[0]![0]).toMatchObject({
      data: { id: 'p1', secret: 'server' },
      params: { postId: 'p1' },
      deps: { q: 'term' },
      context: { root: true },
      routeId: pageRoute.id,
      preload: false,
      cause: 'enter',
      serverContext,
    })
    expect(contextDehydrate.mock.calls[0]![0]).toHaveProperty('location')
    expect(contextDehydrate.mock.calls[0]![0]).toHaveProperty('abortController')
    expect(beforeLoadDehydrate).toHaveBeenCalledOnce()
    expect(beforeLoadDehydrate.mock.calls[0]![0]).toMatchObject({
      data: { user: { name: 'ada', token: 't0k3n' } },
      params: { postId: 'p1' },
      search: { q: 'term' },
      context: { root: true, id: 'p1', secret: 'server' },
      routeId: pageRoute.id,
      serverContext,
    })
    expect(loaderDehydrate).toHaveBeenCalledOnce()
    expect(loaderDehydrate.mock.calls[0]![0]).toMatchObject({
      data: { report: 'summary', raw: [1, 2, 3] },
      params: { postId: 'p1' },
      deps: { q: 'term' },
      context: {
        root: true,
        id: 'p1',
        secret: 'server',
        user: { name: 'ada', token: 't0k3n' },
      },
      route: pageRoute,
      serverContext,
    })
    expect(loaderDehydrate.mock.calls[0]![0]).toHaveProperty(
      'parentMatchPromise',
    )
  })

  test('an async dehydrate is awaited before the match settles', async () => {
    const order: Array<string> = []
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      context: {
        handler: () => ({ session: 'user-1', client: () => 1 }),
        dehydrate: async ({ data }) => {
          await new Promise((resolve) => setTimeout(resolve, 5))
          order.push('parent.context.dehydrate')
          return data.session
        },
        hydrate: ({ data }) => ({ session: String(data), client: () => 1 }),
      },
      beforeLoad: {
        handler: () => {
          order.push('parent.beforeLoad')
          return { guard: 'g' }
        },
        dehydrate: async ({ data }) => {
          await new Promise((resolve) => setTimeout(resolve, 5))
          order.push('parent.beforeLoad.dehydrate')
          return data.guard.toUpperCase()
        },
        hydrate: ({ data }) => ({ guard: String(data) }),
      },
      loader: {
        handler: () => ({ report: 'r', raw: [1] }),
        dehydrate: async ({ data }) => {
          await new Promise((resolve) => setTimeout(resolve, 5))
          order.push('parent.loader.dehydrate')
          return data.report
        },
        hydrate: ({ data }) => ({ report: String(data), raw: [] }),
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      beforeLoad: () => {
        order.push('child.beforeLoad')
      },
      loader: async ({ parentMatchPromise }) => {
        const parent = await parentMatchPromise
        order.push(`child.loader:${parent.status}`)
        return parent.loaderData?.report
      },
    })
    const router = createServerRouter(
      rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      '/parent/child',
    )

    await router.load()

    expect(order).toEqual([
      'parent.context.dehydrate',
      'parent.beforeLoad',
      'parent.beforeLoad.dehydrate',
      'child.beforeLoad',
      'parent.loader.dehydrate',
      'child.loader:success',
    ])
    const parentMatch = matchOf(router, parentRoute)
    expect(parentMatch._dehydrated).toEqual({ m: 'user-1', b: 'G', l: 'r' })
    expect(parentMatch.loaderData).toEqual({ report: 'r', raw: [1] })
    expect(matchOf(router, childRoute)).toMatchObject({
      status: 'success',
      loaderData: 'r',
    })
    expect(wireKeys(matchOf(router, childRoute))).toEqual(['b', 'l'])
  })

  test('a throwing beforeLoad dehydrate is the match error and stops the lane', async () => {
    const boom = new Error('dehydrate failed')
    const onError = vi.fn()
    const childLoader = vi.fn(() => 'child')
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad: {
        handler: () => ({ guard: true }),
        dehydrate: () => {
          throw boom
        },
        hydrate: ({ data }) => data,
      },
      loader: () => 'parent',
      onError,
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: childLoader,
    })
    const router = createServerRouter(
      rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      '/parent/child',
    )

    const response = await loadServerResponse(router, '/parent/child')

    expect(response.status).toBe(500)
    expect(onError).toHaveBeenCalledWith(boom)
    expect(childLoader).not.toHaveBeenCalled()
    const parentMatch = matchOf(router, parentRoute)
    expect(parentMatch).toMatchObject({ status: 'error', error: boom })
    expect(parentMatch.context).not.toHaveProperty('guard')
    expect(wireKeys(parentMatch)).toEqual([])
    expect(dehydrateMatch(parentMatch)).toMatchObject({ s: 'error', e: boom })
  })

  test('a throwing context dehydrate is the match error', async () => {
    const boom = new Error('context dehydrate failed')
    const onError = vi.fn()
    const beforeLoad = vi.fn(() => ({ guard: true }))
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: {
        handler: () => ({ session: 'user-1' }),
        dehydrate: () => {
          throw boom
        },
        hydrate: ({ data }) => data,
      },
      beforeLoad,
      onError,
      errorComponent: () => null,
    })
    const router = createServerRouter(
      rootRoute.addChildren([pageRoute]),
      '/page',
    )

    const response = await loadServerResponse(router, '/page')

    expect(response.status).toBe(500)
    expect(onError).toHaveBeenCalledWith(boom)
    expect(beforeLoad).not.toHaveBeenCalled()
    const match = matchOf(router, pageRoute)
    expect(match).toMatchObject({ status: 'error', error: boom })
    expect(wireKeys(match)).toEqual([])
  })

  test.each([
    [
      'an async context that rejects',
      async () => {
        await Promise.resolve()
        throw new Error('session lookup failed')
      },
    ],
    [
      'a throwing context dehydrate',
      {
        handler: () => ({ session: 'user-1' }),
        dehydrate: () => {
          throw new Error('context dehydrate failed')
        },
        hydrate: ({ data }: any) => data,
      },
    ],
  ])(
    '%s keeps the inherited context, as a failed beforeLoad does',
    async (_, context) => {
      const head = vi.fn(() => ({}))
      const rootRoute = new BaseRootRoute({
        beforeLoad: () => ({ fromRoot: 'root' }),
      })
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        context: context as any,
        head,
        errorComponent: () => null,
      })
      const router = createServerRouter(
        rootRoute.addChildren([pageRoute]),
        '/page',
        { context: { queryClient: 'qc' } },
      )

      const response = await loadServerResponse(router, '/page')

      expect(response.status).toBe(500)
      const match = matchOf(router, pageRoute)
      expect(match.status).toBe('error')
      expect(match.context).toEqual({ queryClient: 'qc', fromRoot: 'root' })
      expect(head).toHaveBeenCalledWith(
        expect.objectContaining({
          match: expect.objectContaining({
            context: { queryClient: 'qc', fromRoot: 'root' },
          }),
        }),
      )
    },
  )

  test('a throwing loader dehydrate is the match error', async () => {
    const boom = new Error('loader dehydrate failed')
    const onError = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      beforeLoad: () => ({ guard: true }),
      loader: {
        handler: () => 'data',
        dehydrate: () => {
          throw boom
        },
        hydrate: ({ data }) => data,
      },
      onError,
      errorComponent: () => null,
    })
    const router = createServerRouter(
      rootRoute.addChildren([pageRoute]),
      '/page',
    )

    const response = await loadServerResponse(router, '/page')

    expect(response.status).toBe(500)
    expect(onError).toHaveBeenCalledWith(boom)
    const match = matchOf(router, pageRoute)
    expect(match).toMatchObject({ status: 'error', error: boom })
    expect(match.loaderData).toBeUndefined()
    expect(wireKeys(match)).toEqual(['b'])
  })

  test.each(['thrown', 'returned'])(
    'a loader codec runs after its loader settles, so a sibling notFound (%s) that settled first decides the response',
    async (style) => {
      // Only a custom `dehydrate` adds an await to a loader's settle: the
      // child below settles before the root's codec fails.
      const rootRoute = new BaseRootRoute({
        loader: {
          handler: () => 'root',
          dehydrate: (): string => {
            throw new Error('codec failed')
          },
          hydrate: ({ data }) => data,
        },
        errorComponent: () => null,
        notFoundComponent: () => null,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/child',
        loader: () => {
          if (style === 'thrown') {
            throw notFound()
          }
          return notFound()
        },
      })
      const router = createServerRouter(
        rootRoute.addChildren([childRoute]),
        '/child',
      )

      const response = await loadServerResponse(router, '/child')

      expect(response.status).toBe(404)
      const root = matchOf(router, rootRoute)
      expect(root).toMatchObject({ status: 'success', _notFound: true })
      expect(isNotFound(root.error)).toBe(true)
      expect(wireKeys(root)).toEqual([])
    },
  )

  test('a request aborted during a beforeLoad dehydrate runs nothing after it', async () => {
    const cancellation = new Error('client went away')
    const controller = new AbortController()
    const childSsr = vi.fn(() => true)
    const childContext = vi.fn(() => ({}))
    const childBeforeLoad = vi.fn()
    const childLoader = vi.fn()
    const rootRoute = new BaseRootRoute({
      beforeLoad: {
        handler: () => ({ guard: true }),
        dehydrate: async ({ data }) => {
          controller.abort(cancellation)
          await Promise.resolve()
          return data
        },
        hydrate: ({ data }) => data,
      },
    })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      ssr: childSsr,
      context: childContext,
      beforeLoad: childBeforeLoad,
      loader: childLoader,
    })
    const router = createServerRouter(
      rootRoute.addChildren([pageRoute]),
      '/page',
    )

    await expect(
      loadServerResponse(router, '/page', controller.signal),
    ).rejects.toBe(cancellation)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(childSsr).not.toHaveBeenCalled()
    expect(childContext).not.toHaveBeenCalled()
    expect(childBeforeLoad).not.toHaveBeenCalled()
    expect(childLoader).not.toHaveBeenCalled()
  })

  test('a redirect thrown from dehydrate is an error, not a redirect', async () => {
    const onError = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const loginRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/login',
    })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader: {
        handler: () => 'data',
        dehydrate: () => {
          throw redirect({ to: '/login' })
        },
        hydrate: ({ data }) => data,
      },
      onError,
      errorComponent: () => null,
    })
    const router = createServerRouter(
      rootRoute.addChildren([loginRoute, pageRoute]),
      '/page',
    )

    const response = await loadServerResponse(router, '/page')

    expect(response.status).toBe(500)
    expect(response.headers.get('location')).toBeNull()
    expect(router._serverResult?.type).toBe('render')
    const match = matchOf(router, pageRoute)
    expect(match.status).toBe('error')
    expect(isRedirect(match.error)).toBe(false)
    expect(match.error).toBeInstanceOf(Error)
    expect(isRedirect((match.error as Error).cause)).toBe(true)
    expect((match.error as Error).message).toMatch(/dehydrate/)
    expect(onError).toHaveBeenCalledWith(match.error)
    expect(wireKeys(match)).toEqual([])
  })

  test('a redirect thrown from a context dehydrate is an error and stops the lane', async () => {
    const onError = vi.fn()
    const beforeLoad = vi.fn(() => ({ guard: true }))
    const loader = vi.fn(() => 'data')
    const rootRoute = new BaseRootRoute({})
    const loginRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/login',
    })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: {
        handler: () => ({ session: 'user-1' }),
        dehydrate: () => {
          throw redirect({ to: '/login' })
        },
        hydrate: ({ data }) => data,
      },
      beforeLoad,
      loader,
      onError,
      errorComponent: () => null,
    })
    const router = createServerRouter(
      rootRoute.addChildren([loginRoute, pageRoute]),
      '/page',
    )

    const response = await loadServerResponse(router, '/page')

    expect(response.status).toBe(500)
    expect(response.headers.get('location')).toBeNull()
    expect(router._serverResult?.type).toBe('render')
    expect(beforeLoad).not.toHaveBeenCalled()
    expect(loader).not.toHaveBeenCalled()
    const match = matchOf(router, pageRoute)
    expect(match.status).toBe('error')
    expect(isRedirect(match.error)).toBe(false)
    expect(match.error).toBeInstanceOf(Error)
    expect(isRedirect((match.error as Error).cause)).toBe(true)
    expect(onError).toHaveBeenCalledWith(match.error)
    expect(wireKeys(match)).toEqual([])
  })

  test('a notFound thrown from dehydrate is an error, not a not-found', async () => {
    const rootRoute = new BaseRootRoute({
      notFoundComponent: () => null,
    })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      beforeLoad: {
        handler: () => ({ guard: true }),
        dehydrate: () => {
          throw notFound()
        },
        hydrate: ({ data }) => data,
      },
      errorComponent: () => null,
    })
    const router = createServerRouter(
      rootRoute.addChildren([pageRoute]),
      '/page',
    )

    const response = await loadServerResponse(router, '/page')

    expect(response.status).toBe(500)
    const match = matchOf(router, pageRoute)
    expect(match.status).toBe('error')
    expect(isNotFound(match.error)).toBe(false)
    expect(match.error).toBeInstanceOf(Error)
    expect(isNotFound((match.error as Error).cause)).toBe(true)
    expect(wireKeys(match)).toEqual([])
  })
})

describe('dehydrateMatch', () => {
  const base = {
    id: '/page',
    updatedAt: 1,
    status: 'success',
  } as unknown as AnyRouteMatch

  test('emits m, b and l by key presence, including undefined values', () => {
    const match = {
      ...base,
      _dehydrated: { m: { session: 'user-1' }, b: undefined, l: 'data' },
    } as AnyRouteMatch

    const dehydrated = dehydrateMatch(match)

    expect(Object.keys(dehydrated).sort()).toEqual([
      'b',
      'i',
      'l',
      'm',
      's',
      'u',
    ])
    expect(dehydrated).toMatchObject({
      i: dehydrateSsrMatchId('/page'),
      u: 1,
      s: 'success',
      m: { session: 'user-1' },
      l: 'data',
    })
    expect(dehydrated).toHaveProperty('b', undefined)
  })

  test('does not emit full values that were not transported', () => {
    const match = {
      ...base,
      _ctx: { session: 'user-1' },
      context: { session: 'user-1', guard: true },
      loaderData: 'data',
    } as AnyRouteMatch

    expect(Object.keys(dehydrateMatch(match)).sort()).toEqual(['i', 's', 'u'])
  })

  test('keeps e, ssr and g', () => {
    const error = new Error('failed')
    const match = {
      ...base,
      status: 'error',
      error,
      ssr: 'data-only',
      _notFound: true,
      _dehydrated: { b: { guard: true } },
    } as AnyRouteMatch

    expect(dehydrateMatch(match)).toEqual({
      i: dehydrateSsrMatchId('/page'),
      u: 1,
      s: 'error',
      b: { guard: true },
      e: error,
      ssr: 'data-only',
      g: true,
    })
  })

  test('the serialized payload keeps undefined wire keys', async () => {
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: { handler: () => undefined, dehydrate: true },
      beforeLoad: () => {},
      loader: () => undefined,
    })
    const routeTree = rootRoute.addChildren([pageRoute])

    const bootstrap = await dehydrateToBootstrap(
      createServerRouter(routeTree, '/page'),
      { routes: {} },
    )
    const dehydrated = bootstrap.router!.matches[1]!
    expect(Object.keys(dehydrated).sort()).toEqual([
      'b',
      'i',
      'l',
      'm',
      's',
      'ssr',
      'u',
    ])
    expect(dehydrated).toHaveProperty('m', undefined)
    expect(dehydrated).toHaveProperty('b', undefined)
    expect(dehydrated).toHaveProperty('l', undefined)

    const router = createServerRouter(routeTree, '/page')
    attachRouterServerSsrUtils({ router, manifest: undefined })
    try {
      await router.load()
      await router.serverSsr!.dehydrate()
      const html = router
        .serverSsr!.takeInitialHydrationScriptTags()!
        .before.map((script) => script.children)
        .join('')
      expect(html).toMatch(/\bm:void 0\b/)
      expect(html).toMatch(/\bb:void 0\b/)
      expect(html).toMatch(/\bl:void 0\b/)
    } finally {
      router.serverSsr?.cleanup()
    }
  })
})

describe('codec error messages', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('development: a redirect or notFound thrown from dehydrate names the fix, with the TanStack Router prefix', async () => {
    const rootRoute = new BaseRootRoute({})
    const loginRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/login',
    })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader: {
        handler: () => 'data',
        dehydrate: () => {
          throw redirect({ to: '/login' })
        },
        hydrate: ({ data }) => data,
      },
      errorComponent: () => null,
    })
    const router = createServerRouter(
      rootRoute.addChildren([loginRoute, pageRoute]),
      '/page',
    )

    await router.load()

    const error = matchOf(router, pageRoute).error as Error
    expect(error.message).toBe(
      'TanStack Router: throw `redirect()` and `notFound()` from `handler`, not from `dehydrate`.',
    )
    expect(isRedirect(error.cause)).toBe(true)
  })

  test('production: the message is "Invalid throw from dehydrate" and keeps the cause', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const rootRoute = new BaseRootRoute({
      notFoundComponent: () => null,
    })
    const loginRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/login',
    })
    const redirectRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/redirect',
      loader: {
        handler: () => 'data',
        dehydrate: () => {
          throw redirect({ to: '/login' })
        },
        hydrate: ({ data }) => data,
      },
      errorComponent: () => null,
    })
    const notFoundRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/not-found',
      beforeLoad: {
        handler: () => ({ guard: true }),
        dehydrate: () => {
          throw notFound()
        },
        hydrate: ({ data }) => data,
      },
      errorComponent: () => null,
    })
    const routeTree = rootRoute.addChildren([
      loginRoute,
      redirectRoute,
      notFoundRoute,
    ])

    const redirectRouter = createServerRouter(routeTree, '/redirect')
    await redirectRouter.load()
    const redirectError = matchOf(redirectRouter, redirectRoute).error as Error
    expect(matchOf(redirectRouter, redirectRoute).status).toBe('error')
    expect(redirectError.message).toBe('Invalid throw from dehydrate')
    expect(isRedirect(redirectError.cause)).toBe(true)

    const notFoundRouter = createServerRouter(routeTree, '/not-found')
    await notFoundRouter.load()
    const notFoundError = matchOf(notFoundRouter, notFoundRoute).error as Error
    expect(matchOf(notFoundRouter, notFoundRoute).status).toBe('error')
    expect(notFoundError.message).toBe('Invalid throw from dehydrate')
    expect(isNotFound(notFoundError.cause)).toBe(true)
  })
})

describe('dev warning: async context that is not transported', () => {
  const ASYNC_CONTEXT_WARNING = /async `context` of route "[^"]+"/

  function spyWarn() {
    return vi.spyOn(console, 'warn').mockImplementation(() => {})
  }

  function asyncContextWarnings(warn: ReturnType<typeof spyWarn>) {
    return warn.mock.calls
      .map((call) => String(call[0]))
      .filter((message) => ASYNC_CONTEXT_WARNING.test(message))
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  test('warns once per route object for the function form, across router instances', async () => {
    const warn = spyWarn()
    function buildTree() {
      const rootRoute = new BaseRootRoute({})
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        context: async () => {
          await Promise.resolve()
          return { session: 'user-1' }
        },
      })
      return { routeTree: rootRoute.addChildren([pageRoute]), pageRoute }
    }
    const { routeTree, pageRoute } = buildTree()

    const router = createServerRouter(routeTree, '/page')
    await router.load()

    expect(asyncContextWarnings(warn)).toHaveLength(1)
    const message = asyncContextWarnings(warn)[0]!
    expect(message).toContain(`"${pageRoute.id}"`)
    // The text must read correctly for the function form, which has no
    // object to set a key on: it tells the reader what to write, and the
    // cost of leaving it as is.
    expect(message).toContain('runs again on the client during hydration')
    expect(message).toContain('`context: { handler, dehydrate: true }`')
    expect(matchOf(router, pageRoute).context).toEqual({ session: 'user-1' })
    expect(matchOf(router, pageRoute)._dehydrated).toBeUndefined()

    // The second load on the same router instance stays quiet.
    await router.load()
    expect(asyncContextWarnings(warn)).toHaveLength(1)

    // The memo is keyed on the route object, not the router: the next router
    // instance over the same tree (the next request in Start dev, which
    // builds a router per request) stays quiet too, so the warning prints
    // once per process per route.
    const next = createServerRouter(routeTree, '/page')
    await next.load()
    await next.load()
    expect(asyncContextWarnings(warn)).toHaveLength(1)

    // A new route object with the same id (a fresh tree, as after HMR
    // replaces the route module) warns once more. Ids are assigned when a
    // router is built over the tree, so the router comes first.
    const fresh = buildTree()
    const freshRouter = createServerRouter(fresh.routeTree, '/page')
    expect(fresh.pageRoute.id).toBe(pageRoute.id)
    await freshRouter.load()
    expect(asyncContextWarnings(warn)).toHaveLength(2)
    expect(asyncContextWarnings(warn)[1]).toContain(`"${pageRoute.id}"`)
  })

  test('warns once per route id: parent and child each get their own warning', async () => {
    const warn = spyWarn()
    const rootRoute = new BaseRootRoute({
      context: async () => {
        await Promise.resolve()
        return { root: true }
      },
    })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: {
        handler: async () => {
          await Promise.resolve()
          return { page: true }
        },
      },
    })
    const router = createServerRouter(
      rootRoute.addChildren([pageRoute]),
      '/page',
    )

    await router.load()
    await router.load()

    const messages = asyncContextWarnings(warn)
    expect(messages).toHaveLength(2)
    expect(messages[0]).toContain(`"${rootRoute.id}"`)
    expect(messages[1]).toContain(`"${pageRoute.id}"`)
  })

  test('warns for the object form with no dehydrate key, an explicit dehydrate: undefined included', async () => {
    const warn = spyWarn()
    const rootRoute = new BaseRootRoute({})
    const omittedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/omitted',
      context: {
        handler: async () => {
          await Promise.resolve()
          return { a: 1 }
        },
      },
    })
    const undefinedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/undefined',
      context: {
        handler: async () => {
          await Promise.resolve()
          return { a: 1 }
        },
        dehydrate: undefined,
      },
    })
    const routeTree = rootRoute.addChildren([omittedRoute, undefinedRoute])

    await createServerRouter(routeTree, '/omitted').load()
    expect(asyncContextWarnings(warn)).toHaveLength(1)
    expect(asyncContextWarnings(warn)[0]).toContain(`"${omittedRoute.id}"`)

    // `dehydrate: undefined` is the default spelled out, not an opt-out.
    await createServerRouter(routeTree, '/undefined').load()
    expect(asyncContextWarnings(warn)).toHaveLength(2)
    expect(asyncContextWarnings(warn)[1]).toContain(`"${undefinedRoute.id}"`)
  })

  test('stays silent for an explicit dehydrate: false, which still runs the context and does not transport it', async () => {
    const warn = spyWarn()
    const rootRoute = new BaseRootRoute({})
    const falseRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/false',
      context: {
        handler: async () => {
          await Promise.resolve()
          return { a: 1 }
        },
        dehydrate: false,
      },
    })
    const router = createServerRouter(
      rootRoute.addChildren([falseRoute]),
      '/false',
    )

    await router.load()

    // An informed opt-out: the reader chose the client re-run.
    expect(asyncContextWarnings(warn)).toHaveLength(0)
    expect(matchOf(router, falseRoute).context).toEqual({ a: 1 })
    expect(matchOf(router, falseRoute)._dehydrated).toBeUndefined()
  })

  test('does not warn for a sync context', async () => {
    const warn = spyWarn()
    const rootRoute = new BaseRootRoute({
      context: () => ({ root: true }),
    })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: { handler: () => ({ page: true }) },
    })
    const router = createServerRouter(
      rootRoute.addChildren([pageRoute]),
      '/page',
    )

    await router.load()

    expect(asyncContextWarnings(warn)).toHaveLength(0)
    expect(matchOf(router, pageRoute).context).toEqual({
      root: true,
      page: true,
    })
  })

  test('does not warn for a transported async context (dehydrate: true or a dehydrate function)', async () => {
    const warn = spyWarn()
    const rootRoute = new BaseRootRoute({})
    const trueRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/true',
      context: {
        handler: async () => {
          await Promise.resolve()
          return { session: 'user-1' }
        },
        dehydrate: true,
      },
    })
    const fnRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/fn',
      context: {
        handler: async () => {
          await Promise.resolve()
          return { session: 'user-1', secret: 'server' }
        },
        dehydrate: ({ data }) => data.session,
        hydrate: ({ data }) => ({ session: String(data), secret: '' }),
      },
    })
    const routeTree = rootRoute.addChildren([trueRoute, fnRoute])

    const trueRouter = createServerRouter(routeTree, '/true')
    await trueRouter.load()
    expect(matchOf(trueRouter, trueRoute)._dehydrated).toEqual({
      m: { session: 'user-1' },
    })

    const fnRouter = createServerRouter(routeTree, '/fn')
    await fnRouter.load()
    expect(matchOf(fnRouter, fnRoute)._dehydrated).toEqual({ m: 'user-1' })

    expect(asyncContextWarnings(warn)).toHaveLength(0)
  })

  test('does not warn for an ssr: false match; a data-only match still warns', async () => {
    const warn = spyWarn()
    const rootRoute = new BaseRootRoute({})
    const clientOnlyRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/client-only',
      ssr: false,
      context: async () => {
        await Promise.resolve()
        return { a: 1 }
      },
    })
    const dataOnlyRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/data-only',
      ssr: 'data-only',
      context: async () => {
        await Promise.resolve()
        return { a: 1 }
      },
    })
    const routeTree = rootRoute.addChildren([clientOnlyRoute, dataOnlyRoute])

    await createServerRouter(routeTree, '/client-only').load()
    expect(asyncContextWarnings(warn)).toHaveLength(0)

    await createServerRouter(routeTree, '/data-only').load()
    expect(asyncContextWarnings(warn)).toHaveLength(1)
    expect(asyncContextWarnings(warn)[0]).toContain(`"${dataOnlyRoute.id}"`)
  })

  test('does not warn when the async handler rejects', async () => {
    const warn = spyWarn()
    const rootRoute = new BaseRootRoute({})
    const loginRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/login',
    })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: async () => {
        await Promise.resolve()
        throw redirect({ to: '/login' })
      },
    })
    const router = createServerRouter(
      rootRoute.addChildren([loginRoute, pageRoute]),
      '/page',
    )

    const response = await loadServerResponse(router, '/page')

    expect(response.status).toBe(307)
    expect(asyncContextWarnings(warn)).toHaveLength(0)
  })

  test('does not warn in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = spyWarn()
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: async () => {
        await Promise.resolve()
        return { session: 'user-1' }
      },
    })
    const router = createServerRouter(
      rootRoute.addChildren([pageRoute]),
      '/page',
    )

    await router.load()

    expect(asyncContextWarnings(warn)).toHaveLength(0)
    expect(matchOf(router, pageRoute).context).toEqual({ session: 'user-1' })
  })
})

describe('environment boundaries', () => {
  test('the server never calls hydrate or revalidate, across load() and invalidate()', async () => {
    const hydrate = vi.fn((): never => {
      throw new Error('hydrate ran on the server')
    })
    const revalidate = vi.fn((): never => {
      throw new Error('revalidate ran on the server')
    })
    const rootRoute = new BaseRootRoute({
      context: {
        handler: () => ({ session: 'user-1' }),
        dehydrate: true,
        hydrate,
        revalidate,
      },
    })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: {
        handler: () => ({ page: true, secret: 'server' }),
        dehydrate: ({ data }) => data.page,
        hydrate,
        revalidate,
      },
      beforeLoad: {
        handler: () => ({ guard: true }),
        dehydrate: true,
        hydrate,
      },
      loader: {
        handler: () => 'data',
        dehydrate: true,
        hydrate,
      },
    })
    const routeTree = rootRoute.addChildren([pageRoute])
    const router = createServerRouter(routeTree, '/page')

    await router.load()
    await router.invalidate()
    const bootstrap = await dehydrateToBootstrap(router, { routes: {} })

    expect(hydrate).not.toHaveBeenCalled()
    expect(revalidate).not.toHaveBeenCalled()
    expect(matchOf(router, rootRoute)).toMatchObject({
      status: 'success',
      context: { session: 'user-1' },
      _dehydrated: { m: { session: 'user-1' } },
    })
    expect(matchOf(router, pageRoute)).toMatchObject({
      status: 'success',
      context: { page: true, secret: 'server' },
      loaderData: 'data',
      _dehydrated: { m: true, b: { guard: true }, l: 'data' },
    })
    expect(bootstrap.router!.matches[1]).toMatchObject({
      m: true,
      b: { guard: true },
      l: 'data',
    })
  })
})
