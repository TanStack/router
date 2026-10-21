import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  _getAssetMatches,
  _getRenderedMatches,
  isNotFound,
  lazyFn,
  notFound,
  redirect,
} from '../src'
import { hydrate } from '../src/ssr/client'
import { dehydrateSsrMatchId } from '../src/ssr/ssr-match-id'
import { dehydrateMatch } from '../src/ssr/ssr-server'
import { createTestRouter } from './routerTestUtils'
import type { AnyRoute, AnyRouteMatch, AnyRouter } from '../src'
import type { DehydratedMatch, TsrSsrGlobal } from '../src/ssr/types'
import type { ServerManifest } from '../src/manifest'

const testManifest: ServerManifest = { routes: {} }

const findMatch = (
  matches: Array<AnyRouteMatch>,
  routeId: string,
): AnyRouteMatch | undefined =>
  matches.find((match) => match.routeId === routeId)

/**
 * Hydration restores each lifecycle result by key presence: `m`, `b` and
 * `l` are present iff the server ran that lifecycle and transported it, even
 * when the value is `undefined`. These tests install the payload directly so
 * every presence combination can be exercised independently of the server
 * runtime.
 */
describe('hydration: lifecycle transport by presence', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }

  beforeEach(() => {
    mockWindow = {}
    vi.stubGlobal('window', mockWindow)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  /**
   * The Start build deletes the other environment's keys from object-form
   * lifecycles: the client build drops `dehydrate`, the server build
   * drops `hydrate` and `context.revalidate`. Every router here sees its
   * options stripped that way, so a runtime that reads the wrong key fails.
   */
  function stripLifecycleOptions<TRouter extends AnyRouter>(
    router: TRouter,
    isServer: boolean,
  ): TRouter {
    for (const route of Object.values(router.routesById) as Array<AnyRoute>) {
      for (const lifecycle of ['context', 'beforeLoad', 'loader'] as const) {
        const option = route.options[lifecycle]
        if (option && typeof option === 'object') {
          const { dehydrate, hydrate, revalidate, ...rest } = option as any
          route.options[lifecycle] = isServer
            ? { ...rest, dehydrate }
            : { ...rest, hydrate, revalidate }
        }
      }
    }
    return router
  }

  /**
   * Builds the payload with a real server router, as the server does: the
   * rendered lane through its terminal match, each match through
   * `dehydrateMatch`. `build` must create fresh routes per call.
   */
  async function roundTrip(
    build: (isServer: boolean) => AnyRouter,
    beforeHydrate?: (router: AnyRouter) => void,
  ) {
    const serverRouter = stripLifecycleOptions(build(true), true)
    await serverRouter.load()
    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        matches: _getRenderedMatches(serverRouter.state.matches).map(
          dehydrateMatch,
        ),
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }
    const router = stripLifecycleOptions(build(false), false)
    beforeHydrate?.(router)
    await hydrate(router)
    return { server: serverRouter.state.matches, router }
  }

  /** Records every published match list as status and loader data. */
  function recordPublications(router: AnyRouter) {
    const publications: Array<
      Array<Pick<AnyRouteMatch, 'routeId' | 'status' | 'loaderData'>>
    > = []
    const setMatches = router.stores.setMatches
    vi.spyOn(router.stores, 'setMatches').mockImplementation((matches) => {
      publications.push(
        matches.map(({ routeId, status, loaderData }) => ({
          routeId,
          status,
          loaderData,
        })),
      )
      setMatches(matches)
    })
    return publications
  }

  function installPayload(
    router: AnyRouter,
    overrides: Array<Partial<DehydratedMatch>> = [],
  ) {
    stripLifecycleOptions(router, false)
    const matches = router.matchRoutes(router.stores.location.get())
    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        matches: matches.map((match, index) => ({
          i: dehydrateSsrMatchId(match.id),
          s: 'success' as const,
          ssr: true as const,
          u: Date.now(),
          ...overrides[index],
        })),
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }
  }

  describe('context (m)', () => {
    test('restores a transported contribution without running the handler and keeps it as the match memo', async () => {
      const handler = vi.fn(() => ({ fromClient: true }))
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        context: { handler, dehydrate: true },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
      })
      const otherRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/other',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute, otherRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer: false,
      })
      installPayload(router, [{}, { m: { fromServer: 'yes' } }, {}])

      await hydrate(router)

      expect(handler).not.toHaveBeenCalled()
      expect(findMatch(router.state.matches, parentRoute.id)).toMatchObject({
        status: 'success',
        context: { fromServer: 'yes' },
      })
      expect(findMatch(router.state.matches, childRoute.id)?.context).toEqual({
        fromServer: 'yes',
      })
      expect(router.state.resolvedLocation?.pathname).toBe('/parent/child')

      // The restored contribution is the per-match memo on later navigations.
      await router.navigate({ to: '/parent/other' })

      expect(handler).not.toHaveBeenCalled()
      expect(findMatch(router.state.matches, otherRoute.id)?.context).toEqual({
        fromServer: 'yes',
      })
    })

    test('restores an undefined contribution (m: undefined) without running the handler', async () => {
      const handler = vi.fn(() => ({ fromClient: true }))
      const rootRoute = new BaseRootRoute({})
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        context: { handler, dehydrate: true },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([pageRoute]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer: false,
      })
      installPayload(router, [{}, { m: undefined }])

      await hydrate(router)

      expect(handler).not.toHaveBeenCalled()
      expect(findMatch(router.state.matches, pageRoute.id)).toMatchObject({
        status: 'success',
        context: {},
      })
    })

    test('passes a transported contribution through a sync hydrate with the context ctx', async () => {
      const handler = vi.fn(() => ({
        postId: 'client',
        rebuilt: 0,
        fromParams: 'client',
      }))
      const hydrateFn = vi.fn(
        ({
          data,
          context,
          params,
        }: {
          data: { id: string }
          context: { rootValue: number }
          params: { id: string }
        }) => ({
          postId: data.id,
          rebuilt: context.rootValue,
          fromParams: params.id,
        }),
      )
      const rootRoute = new BaseRootRoute({
        context: () => ({ rootValue: 1 }),
      })
      const postRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/$id',
        context: {
          handler,
          dehydrate: ({ data }: { data: any }) => ({ id: data.postId }),
          hydrate: hydrateFn,
        },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([postRoute]),
        history: createMemoryHistory({ initialEntries: ['/posts/7'] }),
        isServer: false,
      })
      installPayload(router, [{}, { m: { id: '7' } }])

      await hydrate(router)

      expect(handler).not.toHaveBeenCalled()
      expect(hydrateFn).toHaveBeenCalledTimes(1)
      expect(hydrateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { id: '7' },
          context: { rootValue: 1 },
          params: { id: '7' },
          deps: '',
          routeId: postRoute.id,
          cause: 'enter',
          preload: false,
          location: expect.objectContaining({ pathname: '/posts/7' }),
          matches: expect.any(Array),
        }),
      )
      expect(findMatch(router.state.matches, postRoute.id)?.context).toEqual({
        rootValue: 1,
        postId: '7',
        rebuilt: 1,
        fromParams: '7',
      })
    })

    test('awaits an async hydrate', async () => {
      const rootRoute = new BaseRootRoute({})
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        context: {
          handler: () => ({ value: 'client' }),
          dehydrate: true,
          hydrate: async ({ data }: { data: { value: string } }) => {
            await Promise.resolve()
            return { value: `${data.value}+hydrated` }
          },
        },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([pageRoute]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer: false,
      })
      installPayload(router, [{}, { m: { value: 'server' } }])

      await hydrate(router)

      expect(findMatch(router.state.matches, pageRoute.id)?.context).toEqual({
        value: 'server+hydrated',
      })
    })

    test('runs the declared handler when m is absent and awaits it', async () => {
      const parentHandler = vi.fn(async () => {
        await Promise.resolve()
        return { parentValue: 'computed' }
      })
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        context: { handler: parentHandler },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        context: async ({ context }) => ({
          childValue: `${context.parentValue}/child`,
        }),
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer: false,
      })
      installPayload(router)

      await hydrate(router)

      expect(parentHandler).toHaveBeenCalledTimes(1)
      expect(findMatch(router.state.matches, childRoute.id)).toMatchObject({
        status: 'success',
        context: { parentValue: 'computed', childValue: 'computed/child' },
      })
      expect(router.state.resolvedLocation?.pathname).toBe('/parent/child')
    })

    test.each(['handler', 'hydrate'] as const)(
      'a notFound returned by the context %s is data, not control flow',
      async (source) => {
        const control = () => notFound()
        const handler = vi.fn(control)
        const rootRoute = new BaseRootRoute({})
        const pageRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/page',
          context:
            source === 'handler'
              ? { handler }
              : { handler, dehydrate: true, hydrate: control },
        })
        const targetRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/target',
        })
        const router = createTestRouter({
          routeTree: rootRoute.addChildren([pageRoute, targetRoute]),
          history: createMemoryHistory({ initialEntries: ['/page'] }),
          isServer: false,
        })
        installPayload(router, [{}, source === 'hydrate' ? { m: {} } : {}])

        await hydrate(router)

        expect(findMatch(router.state.matches, pageRoute.id)?.status).toBe(
          'success',
        )
        expect(router.state.resolvedLocation?.pathname).toBe('/page')
        expect(handler).toHaveBeenCalledTimes(source === 'handler' ? 1 : 0)

        await router.load()

        expect(router.state.location.pathname).toBe('/page')
        expect(handler).toHaveBeenCalledTimes(source === 'handler' ? 1 : 0)
      },
    )
  })

  describe('beforeLoad (b)', () => {
    test('restores a transported result without running the handler, including undefined', async () => {
      for (const transported of [{ auth: 'server' }, undefined]) {
        const handler = vi.fn(() => ({ fromClient: true }))
        const rootRoute = new BaseRootRoute({})
        const parentRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/parent',
          beforeLoad: { handler },
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
          isServer: false,
        })
        installPayload(router, [{}, { b: transported }, {}])

        await hydrate(router)

        expect(handler).not.toHaveBeenCalled()
        expect(findMatch(router.state.matches, childRoute.id)?.context).toEqual(
          transported ?? {},
        )
        expect(router.state.resolvedLocation?.pathname).toBe('/parent/child')
      }
    })

    test('passes a transported result through hydrate with the beforeLoad ctx', async () => {
      const handler = vi.fn(() => ({ auth: 'client', fromHydrate: 'client' }))
      const hydrateFn = vi.fn(
        ({ data, context }: { data: { auth: string }; context: any }) => ({
          ...data,
          fromHydrate: context.own,
        }),
      )
      const rootRoute = new BaseRootRoute({})
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        context: () => ({ own: 'ctx' }),
        beforeLoad: { handler, dehydrate: true, hydrate: hydrateFn },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([pageRoute]),
        history: createMemoryHistory({ initialEntries: ['/page?x=1'] }),
        isServer: false,
      })
      installPayload(router, [{}, { b: { auth: 'server' } }])

      await hydrate(router)

      expect(handler).not.toHaveBeenCalled()
      expect(hydrateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { auth: 'server' },
          context: { own: 'ctx' },
          search: { x: 1 },
          params: {},
          routeId: pageRoute.id,
          preload: false,
        }),
      )
      expect(findMatch(router.state.matches, pageRoute.id)?.context).toEqual({
        own: 'ctx',
        auth: 'server',
        fromHydrate: 'ctx',
      })
    })

    test('re-runs a declared beforeLoad in place when b is absent, serially after its context, and keeps transported descendants', async () => {
      const parentBeforeLoad = vi.fn(({ context }: { context: any }) => ({
        guard: `${context.rootGuard}/${context.own}`,
      }))
      const parentLoader = vi.fn(() => 'client parent')
      const childLoader = vi.fn(() => 'client child')
      const rootRoute = new BaseRootRoute({
        beforeLoad: {
          handler: () => ({ rootGuard: 'root' }),
          dehydrate: false,
        },
      })
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        context: () => ({ own: 'ctx' }),
        beforeLoad: { handler: parentBeforeLoad, dehydrate: false },
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
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer: false,
      })
      installPayload(router, [
        {},
        { l: 'server parent' },
        { l: 'server child' },
      ])

      await hydrate(router)

      expect(parentBeforeLoad).toHaveBeenCalledTimes(1)
      expect(parentBeforeLoad).toHaveBeenCalledWith(
        expect.objectContaining({
          context: { rootGuard: 'root', own: 'ctx' },
          search: {},
          preload: false,
          cause: 'enter',
        }),
      )
      expect(parentLoader).not.toHaveBeenCalled()
      expect(childLoader).not.toHaveBeenCalled()
      expect(findMatch(router.state.matches, parentRoute.id)).toMatchObject({
        status: 'success',
        context: { rootGuard: 'root', own: 'ctx', guard: 'root/ctx' },
        loaderData: 'server parent',
      })
      expect(findMatch(router.state.matches, childRoute.id)).toMatchObject({
        status: 'success',
        context: { rootGuard: 'root', own: 'ctx', guard: 'root/ctx' },
        loaderData: 'server child',
      })
      expect(router.state.resolvedLocation?.pathname).toBe('/parent/child')
    })

    test('a redirect thrown by an in-place beforeLoad makes it the pending boundary; the client load follows it from the hydrated prefix', async () => {
      const rootLoader = vi.fn(() => 'client root')
      const targetLoader = vi.fn(() => 'target')
      const guard = vi.fn(() => {
        throw redirect({ to: '/target' })
      })
      const rootRoute = new BaseRootRoute({ loader: rootLoader })
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        beforeLoad: { handler: guard, dehydrate: false },
      })
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
        loader: targetLoader,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([parentRoute, targetRoute]),
        history: createMemoryHistory({ initialEntries: ['/parent'] }),
        isServer: false,
      })
      installPayload(router, [{ l: 'server root' }, {}])

      await hydrate(router)

      expect(guard).toHaveBeenCalledTimes(1)
      expect(router.state.location.pathname).toBe('/parent')
      expect(router.state.resolvedLocation).toBeUndefined()
      expect(findMatch(router.state.matches, parentRoute.id)).toMatchObject({
        status: 'pending',
        error: undefined,
      })

      // As Transitioner does after hydration.
      await router.load()

      expect(router.state.location.pathname).toBe('/target')
      expect(router.state.status).toBe('idle')
      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        targetRoute.id,
      ])
      expect(findMatch(router.state.matches, targetRoute.id)?.loaderData).toBe(
        'target',
      )
      expect(targetLoader).toHaveBeenCalledTimes(1)
      expect(rootLoader).not.toHaveBeenCalled()
      expect(findMatch(router.state.matches, rootRoute.id)?.loaderData).toBe(
        'server root',
      )
      // The failing guard runs again in the client load.
      expect(guard).toHaveBeenCalledTimes(2)
    })

    test('a notFound thrown by an in-place beforeLoad makes it the pending boundary and keeps cut descendants cached', async () => {
      let throwOnce = true
      const guard = vi.fn(() => {
        if (throwOnce) {
          throwOnce = false
          throw notFound()
        }
        return {}
      })
      const childLoader = vi.fn(() => 'client child')
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        notFoundComponent: () => 'not found',
        beforeLoad: { handler: guard, dehydrate: false },
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
        isServer: false,
      })
      installPayload(router, [{}, {}, { l: 'server child' }])

      await hydrate(router)

      const parent = findMatch(router.state.matches, parentRoute.id)
      expect(parent).toMatchObject({ status: 'pending', error: undefined })
      expect(
        _getRenderedMatches(router.state.matches).map((match) => match.routeId),
      ).toEqual([rootRoute.id, parentRoute.id])
      expect(router.state.resolvedLocation).toBeUndefined()

      await router.load()

      // The client run passes, and the cut descendant's transported data
      // serves the client load.
      expect(guard).toHaveBeenCalledTimes(2)
      expect(findMatch(router.state.matches, parentRoute.id)?.status).toBe(
        'success',
      )
      expect(findMatch(router.state.matches, childRoute.id)).toMatchObject({
        status: 'success',
        loaderData: 'server child',
      })
      expect(childLoader).not.toHaveBeenCalled()
      expect(router.state.resolvedLocation?.pathname).toBe('/parent/child')
    })

    test('a notFound without a local boundary marks the root _notFound in the client load', async () => {
      const guard = vi.fn(() => {
        throw notFound()
      })
      const rootRoute = new BaseRootRoute({
        notFoundComponent: () => 'not found',
      })
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        beforeLoad: { handler: guard, dehydrate: false },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([pageRoute]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer: false,
      })
      installPayload(router)

      await hydrate(router)

      expect(findMatch(router.state.matches, pageRoute.id)?.status).toBe(
        'pending',
      )
      expect(findMatch(router.state.matches, rootRoute.id)?._notFound).toBe(
        undefined,
      )

      await router.load()

      expect(findMatch(router.state.matches, rootRoute.id)).toMatchObject({
        status: 'success',
        _notFound: true,
      })
      expect(
        isNotFound(findMatch(router.state.matches, rootRoute.id)?.error),
      ).toBe(true)
      expect(guard).toHaveBeenCalledTimes(2)
    })

    test('an error thrown by an in-place beforeLoad becomes an error match in the client load, with onError once', async () => {
      const error = new Error('guard failed')
      const onError = vi.fn()
      const guard = vi.fn(() => {
        throw error
      })
      const childLoader = vi.fn(() => 'client child')
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        errorComponent: () => 'error',
        onError,
        beforeLoad: { handler: guard, dehydrate: false },
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
        isServer: false,
      })
      installPayload(router, [{}, {}, { l: 'server child' }])

      await hydrate(router)

      expect(onError).not.toHaveBeenCalled()
      expect(findMatch(router.state.matches, parentRoute.id)).toMatchObject({
        status: 'pending',
        error: undefined,
      })

      await router.load()

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(error)
      expect(findMatch(router.state.matches, parentRoute.id)).toMatchObject({
        status: 'error',
        error,
      })
      expect(
        _getRenderedMatches(router.state.matches).map((match) => match.routeId),
      ).toEqual([rootRoute.id, parentRoute.id])
      expect(router.state.resolvedLocation?.pathname).toBe('/parent/child')
      expect(guard).toHaveBeenCalledTimes(2)
      expect(childLoader).not.toHaveBeenCalled()
    })
  })

  describe('loader (l)', () => {
    test('restores undefined loader data (l: undefined) without running the loader', async () => {
      const loader = vi.fn(() => 'client')
      const rootRoute = new BaseRootRoute({})
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        loader,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([pageRoute]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer: false,
      })
      installPayload(router, [{}, { l: undefined }])

      await hydrate(router)

      expect(loader).not.toHaveBeenCalled()
      const match = findMatch(router.state.matches, pageRoute.id)
      expect(match?.status).toBe('success')
      expect(match).toHaveProperty('loaderData', undefined)
    })

    test('passes transported loader data through sync and async hydrate with the loader ctx', async () => {
      const parentHandler = vi.fn(() => ({ report: 'client' }))
      const parentHydrate = vi.fn(
        ({
          data,
          context,
        }: {
          data: { report: string }
          context: { locale: string }
        }) => ({
          ...data,
          formatted: `${data.report}:${context.locale}`,
        }),
      )
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        beforeLoad: () => ({ locale: 'client' }),
        loader: {
          handler: parentHandler,
          dehydrate: true,
          hydrate: parentHydrate,
        },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: {
          handler: () => ({ child: 0 }),
          dehydrate: true,
          hydrate: async ({ data }: { data: { child: number } }) => {
            await Promise.resolve()
            return { ...data, async: true }
          },
        },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer: false,
      })
      const serverUpdatedAt = Date.now() - 10_000
      installPayload(router, [
        {},
        { b: { locale: 'de' }, l: { report: 'r' }, u: serverUpdatedAt },
        { l: { child: 1 } },
      ])

      await hydrate(router)

      expect(parentHandler).not.toHaveBeenCalled()
      expect(parentHydrate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { report: 'r' },
          context: { locale: 'de' },
          params: {},
          deps: '',
          route: parentRoute,
          preload: false,
          cause: 'enter',
        }),
      )
      expect(findMatch(router.state.matches, parentRoute.id)).toMatchObject({
        status: 'success',
        loaderData: { report: 'r', formatted: 'r:de' },
        updatedAt: serverUpdatedAt,
      })
      expect(findMatch(router.state.matches, childRoute.id)).toMatchObject({
        status: 'success',
        loaderData: { child: 1, async: true },
      })
      expect(router.state.resolvedLocation?.pathname).toBe('/parent/child')
    })

    test('re-runs a declared loader in place when l is absent, with the full context and a real updatedAt', async () => {
      const parentLoader = vi.fn(({ context }: { context: any }) => ({
        report: context.locale,
      }))
      const childLoader = vi.fn(() => 'client child')
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        beforeLoad: () => ({ locale: 'client' }),
        loader: { handler: parentLoader, dehydrate: false },
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
        isServer: false,
      })
      installPayload(router, [
        {},
        { b: { locale: 'de' }, u: 1 },
        { l: 'server child' },
      ])
      const before = Date.now()

      await hydrate(router)

      expect(parentLoader).toHaveBeenCalledTimes(1)
      expect(parentLoader).toHaveBeenCalledWith(
        expect.objectContaining({
          context: { locale: 'de' },
          deps: '',
          route: parentRoute,
          preload: false,
          cause: 'enter',
        }),
      )
      expect(childLoader).not.toHaveBeenCalled()
      const parent = findMatch(router.state.matches, parentRoute.id)
      expect(parent).toMatchObject({
        status: 'success',
        loaderData: { report: 'de' },
        invalid: false,
      })
      expect(parent!.updatedAt).toBeGreaterThanOrEqual(before)
      expect(findMatch(router.state.matches, childRoute.id)).toMatchObject({
        status: 'success',
        loaderData: 'server child',
      })
      expect(router.state.resolvedLocation?.pathname).toBe('/parent/child')
    })

    test('an error thrown by an in-place loader becomes an error match in the client load, with onError once', async () => {
      const error = new Error('loader failed')
      const onError = vi.fn()
      const parentLoader = vi.fn(() => {
        throw error
      })
      const childLoader = vi.fn(() => 'client child')
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        errorComponent: () => 'error',
        onError,
        loader: { handler: parentLoader, dehydrate: false },
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
        isServer: false,
      })
      installPayload(router, [{}, {}, { l: 'server child' }])

      await hydrate(router)

      expect(onError).not.toHaveBeenCalled()
      expect(findMatch(router.state.matches, parentRoute.id)).toMatchObject({
        status: 'pending',
        error: undefined,
      })
      expect(
        findMatch(router.state.matches, parentRoute.id),
      ).not.toHaveProperty('loaderData')

      await router.load()

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(error)
      expect(findMatch(router.state.matches, parentRoute.id)).toMatchObject({
        status: 'error',
        error,
      })
      expect(
        _getRenderedMatches(router.state.matches).map((match) => match.routeId),
      ).toEqual([rootRoute.id, parentRoute.id])
      expect(parentLoader).toHaveBeenCalledTimes(2)
      expect(childLoader).not.toHaveBeenCalled()
    })

    test('an in-place loader failure is recovered when its client run succeeds, and cut descendants stay cached', async () => {
      let throwOnce = true
      const parentLoader = vi.fn(() => {
        if (throwOnce) {
          throwOnce = false
          throw new Error('loader failed')
        }
        return 'client parent'
      })
      const childLoader = vi.fn(() => 'client child')
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        errorComponent: () => 'error',
        loader: { handler: parentLoader, dehydrate: false },
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
        isServer: false,
      })
      installPayload(router, [{}, {}, { l: 'server child' }])

      await hydrate(router)
      await router.load()

      expect(parentLoader).toHaveBeenCalledTimes(2)
      expect(findMatch(router.state.matches, parentRoute.id)).toMatchObject({
        status: 'success',
        loaderData: 'client parent',
      })
      expect(findMatch(router.state.matches, childRoute.id)).toMatchObject({
        status: 'success',
        loaderData: 'server child',
      })
      expect(childLoader).not.toHaveBeenCalled()
    })

    test('a notFound thrown by an in-place loader is installed at the nearest boundary by the client load', async () => {
      const childLoader = vi.fn(() => {
        throw notFound()
      })
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        notFoundComponent: () => 'not found',
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: { handler: childLoader, dehydrate: false },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer: false,
      })
      installPayload(router)

      await hydrate(router)

      expect(findMatch(router.state.matches, childRoute.id)?.status).toBe(
        'pending',
      )
      expect(findMatch(router.state.matches, parentRoute.id)?.status).toBe(
        'success',
      )

      await router.load()

      const parent = findMatch(router.state.matches, parentRoute.id)
      expect(parent?.status).toBe('notFound')
      expect(isNotFound(parent?.error)).toBe(true)
      expect(
        _getRenderedMatches(router.state.matches).map((match) => match.routeId),
      ).toEqual([rootRoute.id, parentRoute.id])
      expect(childLoader).toHaveBeenCalledTimes(2)
    })

    test.each([
      ['beforeLoad', 'redirect'],
      ['beforeLoad', 'notFound'],
      ['loader', 'redirect'],
      ['loader', 'notFound'],
    ] as const)(
      'a %s re-run in place that returns a %s takes the same fallback as a thrown one',
      async (lifecycle, kind) => {
        const handler = vi.fn(() =>
          kind === 'redirect' ? redirect({ to: '/target' }) : notFound(),
        )
        const rootRoute = new BaseRootRoute({})
        const pageRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/page',
          notFoundComponent: () => 'not found',
          beforeLoad:
            lifecycle === 'beforeLoad'
              ? { handler, dehydrate: false }
              : undefined,
          loader:
            lifecycle === 'loader' ? { handler, dehydrate: false } : undefined,
        })
        const targetRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/target',
        })
        const router = createTestRouter({
          routeTree: rootRoute.addChildren([pageRoute, targetRoute]),
          history: createMemoryHistory({ initialEntries: ['/page'] }),
          isServer: false,
        })
        installPayload(router)

        await hydrate(router)

        // Neither stored as context nor as loader data.
        const page = findMatch(router.state.matches, pageRoute.id)!
        expect(page.status).toBe('pending')
        expect(page).not.toHaveProperty('loaderData')
        expect(Object.keys(page.context)).toEqual([])
        expect(router.state.resolvedLocation).toBeUndefined()

        await router.load()

        expect(handler).toHaveBeenCalledTimes(2)
        if (kind === 'redirect') {
          expect(router.state.location.pathname).toBe('/target')
          expect(router.state.matches.map((match) => match.routeId)).toEqual([
            rootRoute.id,
            targetRoute.id,
          ])
        } else {
          expect(findMatch(router.state.matches, pageRoute.id)).toMatchObject({
            status: 'notFound',
          })
          expect(
            isNotFound(findMatch(router.state.matches, pageRoute.id)?.error),
          ).toBe(true)
        }
      },
    )
  })

  describe('custom codecs with options stripped per build', () => {
    test('each lifecycle ships its wire value and the client rebuilds it without running the handler', async () => {
      const clientHandlers = {
        context: vi.fn(() => ({ count: 0 })),
        beforeLoad: vi.fn(() => ({ at: new Date(1) })),
        loader: vi.fn(() => ({ items: ['client'] })),
      }
      const build = (isServer: boolean) => {
        const rootRoute = new BaseRootRoute({})
        const pageRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/page',
          context: {
            handler: isServer ? () => ({ count: 2 }) : clientHandlers.context,
            dehydrate: ({ data }) => data.count,
            hydrate: ({ data }) => ({ count: data, rebuilt: true }),
          },
          beforeLoad: {
            handler: isServer
              ? () => ({ at: new Date(0) })
              : clientHandlers.beforeLoad,
            dehydrate: ({ data }) => data.at.toISOString(),
            hydrate: ({ data }) => ({ at: new Date(data) }),
          },
          loader: {
            handler: isServer
              ? () => ({ items: ['a', 'b'] })
              : clientHandlers.loader,
            dehydrate: ({ data }) => data.items.join(','),
            hydrate: ({ data }) => ({ items: data.split(',') }),
          },
        })
        return createTestRouter({
          routeTree: rootRoute.addChildren([pageRoute]),
          history: createMemoryHistory({ initialEntries: ['/page'] }),
          isServer,
        })
      }

      const { router } = await roundTrip(build)

      expect(mockWindow.$_TSR!.router!.matches[1]).toMatchObject({
        m: 2,
        b: '1970-01-01T00:00:00.000Z',
        l: 'a,b',
      })
      expect(router.state.matches[1]).toMatchObject({
        status: 'success',
        context: { count: 2, rebuilt: true, at: new Date(0) },
        loaderData: { items: ['a', 'b'] },
      })
      expect(clientHandlers.context).not.toHaveBeenCalled()
      expect(clientHandlers.beforeLoad).not.toHaveBeenCalled()
      expect(clientHandlers.loader).not.toHaveBeenCalled()
    })
  })

  test('a code-split function loader keeps the server data without loading its chunk', async () => {
    const importLoader = vi.fn(async () => ({
      loader: () => ({ items: ['client'] }),
    }))
    const { server, router } = await roundTrip((isServer) => {
      const rootRoute = new BaseRootRoute({})
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        loader: isServer
          ? () => ({ items: ['a', 'b'] })
          : lazyFn(importLoader, 'loader'),
      })
      return createTestRouter({
        routeTree: rootRoute.addChildren([pageRoute]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer,
      })
    })

    expect(router.state.matches[1]).toMatchObject({
      status: 'success',
      loaderData: { items: ['a', 'b'] },
      updatedAt: server[1]!.updatedAt,
    })
    expect(importLoader).not.toHaveBeenCalled()
  })

  describe("a failing hydrate transform is recovered by the handler's client run", () => {
    test('a redirect thrown from a loader hydrate re-runs the loader handler in the client load', async () => {
      const handler = vi.fn(() => 'client')
      const onError = vi.fn()
      const rootRoute = new BaseRootRoute({})
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        errorComponent: () => 'error',
        onError,
        loader: {
          handler,
          dehydrate: true,
          hydrate: () => {
            throw redirect({ to: '/target' })
          },
        },
      })
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([pageRoute, targetRoute]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer: false,
      })
      installPayload(router, [{}, { l: 'server' }])

      await hydrate(router)

      const match = findMatch(router.state.matches, pageRoute.id)
      expect(match?.status).toBe('pending')
      // The wire value never becomes loader data when its transform fails.
      expect(match).not.toHaveProperty('loaderData')
      expect(handler).not.toHaveBeenCalled()

      await router.load()

      expect(handler).toHaveBeenCalledTimes(1)
      expect(findMatch(router.state.matches, pageRoute.id)).toMatchObject({
        status: 'success',
        loaderData: 'client',
      })
      expect(onError).not.toHaveBeenCalled()
      expect(router.state.location.pathname).toBe('/page')
      expect(router.state.resolvedLocation?.pathname).toBe('/page')
    })

    test.each(['context', 'beforeLoad', 'loader'] as const)(
      'in development, a throwing %s hydrate warns once that the client load runs the route again',
      async (lifecycle) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const cause = new Error('transform failed')
        const option = {
          handler: () => ({ value: 'client' }),
          dehydrate: true as const,
          hydrate: () => {
            throw cause
          },
        }
        const rootRoute = new BaseRootRoute({})
        const pageRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/page',
          context: lifecycle === 'context' ? option : undefined,
          beforeLoad: lifecycle === 'beforeLoad' ? option : undefined,
          loader: lifecycle === 'loader' ? option : undefined,
        })
        const router = createTestRouter({
          routeTree: rootRoute.addChildren([pageRoute]),
          history: createMemoryHistory({ initialEntries: ['/page'] }),
          isServer: false,
        })
        installPayload(router, [
          {},
          {
            [{ context: 'm', beforeLoad: 'b', loader: 'l' }[lifecycle]]: {
              value: 'server',
            },
          },
        ])

        await hydrate(router)

        expect(findMatch(router.state.matches, pageRoute.id)?.status).toBe(
          'pending',
        )
        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining(
            `route "${pageRoute.id}" failed during hydration`,
          ),
          cause,
        )
      },
    )

    test.each([
      ['beforeLoad', 'redirect'],
      ['beforeLoad', 'notFound'],
      ['loader', 'redirect'],
      ['loader', 'notFound'],
    ] as const)(
      'a %s hydrate that returns a %s is a failure, and the handler recovers in the client load',
      async (lifecycle, kind) => {
        const handler = vi.fn(() => ({ value: 'client' }))
        const option = {
          handler,
          dehydrate: true as const,
          // Invalid JavaScript output must trigger normal client recovery.
          hydrate: (): any =>
            kind === 'redirect' ? redirect({ to: '/target' }) : notFound(),
        }
        const rootRoute = new BaseRootRoute({})
        const pageRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/page',
          notFoundComponent: () => 'not found',
          beforeLoad: lifecycle === 'beforeLoad' ? option : undefined,
          loader: lifecycle === 'loader' ? option : undefined,
        })
        const targetRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/target',
        })
        const router = createTestRouter({
          routeTree: rootRoute.addChildren([pageRoute, targetRoute]),
          history: createMemoryHistory({ initialEntries: ['/page'] }),
          isServer: false,
        })
        installPayload(router, [
          {},
          lifecycle === 'beforeLoad'
            ? { b: { value: 'server' } }
            : { l: { value: 'server' } },
        ])

        await hydrate(router)

        // Neither stored as context nor as loader data.
        const page = findMatch(router.state.matches, pageRoute.id)!
        expect(page.status).toBe('pending')
        expect(page).not.toHaveProperty('loaderData')
        expect(page.context).toEqual({})

        await router.load()

        expect(handler).toHaveBeenCalledTimes(1)
        expect(router.state.location.pathname).toBe('/page')
        expect(findMatch(router.state.matches, pageRoute.id)).toMatchObject(
          lifecycle === 'beforeLoad'
            ? { status: 'success', context: { value: 'client' } }
            : { status: 'success', loaderData: { value: 'client' } },
        )
      },
    )

    test('a notFound thrown from a context hydrate re-runs the context handler in the client load', async () => {
      const handler = vi.fn(() => ({ value: 'client' }))
      const rootRoute = new BaseRootRoute({})
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        errorComponent: () => 'error',
        notFoundComponent: () => 'not found',
        context: {
          handler,
          dehydrate: true,
          hydrate: () => {
            throw notFound()
          },
        },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => pageRoute,
        path: '/child',
        loader: () => 'child',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([pageRoute.addChildren([childRoute])]),
        history: createMemoryHistory({ initialEntries: ['/page/child'] }),
        isServer: false,
      })
      installPayload(router, [
        {},
        { m: { value: 'server' } },
        { l: 'server child' },
      ])

      await hydrate(router)

      expect(findMatch(router.state.matches, pageRoute.id)?.status).toBe(
        'pending',
      )
      expect(handler).not.toHaveBeenCalled()

      await router.load()

      expect(handler).toHaveBeenCalledTimes(1)
      expect(findMatch(router.state.matches, pageRoute.id)).toMatchObject({
        status: 'success',
        context: { value: 'client' },
      })
      expect(findMatch(router.state.matches, childRoute.id)).toMatchObject({
        status: 'success',
        context: { value: 'client' },
        loaderData: 'server child',
      })
    })

    test.each(['context', 'beforeLoad'] as const)(
      'a pending boundary whose %s failed keeps the inherited context, router context included',
      async (failing) => {
        let failOnce = true
        const handler = () => {
          if (failOnce) {
            failOnce = false
            throw new Error(`${failing} failed on the client`)
          }
          return { own: 'client' }
        }
        const rootRoute = new BaseRootRoute({
          context: () => ({ fromRoot: 'r' }),
        })
        const pageRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/page',
          pendingComponent: () => 'pending',
          [failing]: handler,
        })
        const router = createTestRouter({
          routeTree: rootRoute.addChildren([pageRoute]),
          history: createMemoryHistory({ initialEntries: ['/page'] }),
          isServer: false,
          context: { queryClient: 'qc' },
        })
        installPayload(router, [{}, {}])

        await hydrate(router)

        expect(findMatch(router.state.matches, pageRoute.id)).toMatchObject({
          status: 'pending',
          context: { queryClient: 'qc', fromRoot: 'r' },
        })

        await router.load()

        expect(findMatch(router.state.matches, pageRoute.id)).toMatchObject({
          status: 'success',
          context: { queryClient: 'qc', fromRoot: 'r', own: 'client' },
        })
      },
    )
  })

  describe('a terminal match keeps the server result, and only its context re-runs', () => {
    // A match the server settled as error or notFound, and a `_notFound` root,
    // render the server's boundary; a pending boundary there would replace
    // that markup. The wire cannot tell whether the server ran a lifecycle it
    // did not transport, so no beforeLoad or loader re-runs there.
    test.each(['error match', 'notFound boundary', '_notFound root'] as const)(
      'a %s runs no non-transported beforeLoad or loader',
      async (kind) => {
        const client = { beforeLoad: 0, loader: 0 }
        const build = (isServer: boolean) => {
          const lifecycles = {
            beforeLoad: {
              handler: () => {
                if (!isServer) {
                  client.beforeLoad++
                }
                return { guard: isServer ? 'server' : 'client' }
              },
              dehydrate: false,
            },
            loader: {
              handler: () => {
                if (!isServer) {
                  client.loader++
                }
                if (kind === 'error match') {
                  throw new Error('loader failed')
                }
                return isServer ? 'server' : 'client'
              },
              dehydrate: false,
            },
          } as const
          const rootRoute = new BaseRootRoute({
            notFoundComponent: () => 'root not found',
            ...(kind === '_notFound root' ? lifecycles : {}),
          })
          const boundaryRoute = new BaseRoute({
            getParentRoute: () => rootRoute,
            path: '/boundary',
            errorComponent: () => 'error',
            notFoundComponent: () => 'not found',
            ...(kind === '_notFound root' ? {} : lifecycles),
          })
          const childRoute = new BaseRoute({
            getParentRoute: () => boundaryRoute,
            path: '/child',
            loader: () => {
              throw notFound()
            },
          })
          return createTestRouter({
            routeTree: rootRoute.addChildren([
              boundaryRoute.addChildren([childRoute]),
            ]),
            history: createMemoryHistory({
              initialEntries: [
                kind === '_notFound root' ? '/missing' : '/boundary/child',
              ],
            }),
            isServer,
          })
        }

        const { server, router } = await roundTrip(build)

        const index = kind === '_notFound root' ? 0 : 1
        // The server ran both lifecycles there.
        expect(server[index]!.context).toEqual({ guard: 'server' })
        if (kind !== 'error match') {
          expect(server[index]!.loaderData).toBe('server')
        }
        expect(client).toEqual({ beforeLoad: 0, loader: 0 })
        const match = router.state.matches[index]!
        expect(match.status).toBe(server[index]!.status)
        expect(match._notFound).toBe(server[index]!._notFound)
        expect(match.context).toEqual({})
        expect(router.state.status).toBe('idle')
        expect(router.state.resolvedLocation?.pathname).toBe(
          router.state.location.pathname,
        )
      },
    )

    test.each(['beforeLoad', 'loader'] as const)(
      'a throwing %s hydrate is ignored: only that contribution is dropped and no handler runs',
      async (failing) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const beforeLoad = vi.fn(() => ({ guard: 'client' }))
        const loader = vi.fn(() => ({ list: ['client'] }))
        const onError = vi.fn()
        const build = (isServer: boolean) => {
          const rootRoute = new BaseRootRoute({})
          const boundaryRoute = new BaseRoute({
            getParentRoute: () => rootRoute,
            path: '/boundary',
            notFoundComponent: () => 'not found',
            onError: isServer ? undefined : onError,
            beforeLoad: {
              handler: isServer ? () => ({ guard: 'server' }) : beforeLoad,
              dehydrate: true,
              hydrate: ({ data }) => {
                if (failing === 'beforeLoad') {
                  throw new Error('transform failed')
                }
                return { ...data, hydrated: true }
              },
            },
            loader: {
              handler: isServer ? () => ({ list: ['a', 'b'] }) : loader,
              dehydrate: ({ data }) => data.list.join(','),
              hydrate: ({ data }) => {
                if (failing === 'loader') {
                  throw new Error('transform failed')
                }
                return { list: data.split(',') }
              },
            },
          })
          const childRoute = new BaseRoute({
            getParentRoute: () => boundaryRoute,
            path: '/child',
            loader: () => {
              throw notFound()
            },
          })
          return createTestRouter({
            routeTree: rootRoute.addChildren([
              boundaryRoute.addChildren([childRoute]),
            ]),
            history: createMemoryHistory({
              initialEntries: ['/boundary/child'],
            }),
            isServer,
          })
        }

        const { server, router } = await roundTrip(build)

        expect(server[1]!.status).toBe('notFound')
        const boundary = router.state.matches[1]!
        expect(boundary.status).toBe('notFound')
        expect(isNotFound(boundary.error)).toBe(true)
        if (failing === 'beforeLoad') {
          expect(boundary.context).toEqual({})
          expect(boundary.loaderData).toEqual({ list: ['a', 'b'] })
        } else {
          expect(boundary.context).toEqual({ guard: 'server', hydrated: true })
          // Never the wire value.
          expect(boundary).not.toHaveProperty('loaderData')
        }
        expect(beforeLoad).not.toHaveBeenCalled()
        expect(loader).not.toHaveBeenCalled()
        expect(onError).not.toHaveBeenCalled()
        expect(router.state.resolvedLocation?.pathname).toBe('/boundary/child')
        // Development builds say what was ignored.
        expect(warn.mock.calls).toEqual([
          [
            `TanStack Router: the \`${failing}.hydrate\` of route "/boundary" failed during hydration and is ignored, because the route keeps the error or not-found the server rendered.`,
            new Error('transform failed'),
          ],
        ])
      },
    )

    test.each(['returns', 'throws'] as const)(
      'its context re-runs, and when it %s the match context is the parent context, that result and the transported beforeLoad result',
      async (outcome) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const clientContext = vi.fn(() => {
          if (outcome === 'throws') {
            throw new Error('context failed on the client')
          }
          return { fromContext: 'client' }
        })
        const build = (isServer: boolean) => {
          const rootRoute = new BaseRootRoute({
            context: () => ({ fromRoot: true }),
          })
          const pageRoute = new BaseRoute({
            getParentRoute: () => rootRoute,
            path: '/page',
            errorComponent: () => 'error',
            context: isServer
              ? () => ({ fromContext: 'server' })
              : clientContext,
            beforeLoad: () => ({ guard: isServer ? 'server' : 'client' }),
            loader: () => {
              throw new Error('loader failed')
            },
          })
          return createTestRouter({
            routeTree: rootRoute.addChildren([pageRoute]),
            history: createMemoryHistory({ initialEntries: ['/page'] }),
            isServer,
          })
        }

        const { router } = await roundTrip(build)

        expect(clientContext).toHaveBeenCalledTimes(1)
        const page = router.state.matches[1]!
        expect(page).toMatchObject({
          status: 'error',
          error: expect.objectContaining({ message: 'loader failed' }),
        })
        expect(page.context).toEqual(
          outcome === 'returns'
            ? { fromRoot: true, fromContext: 'client', guard: 'server' }
            : { fromRoot: true, guard: 'server' },
        )
        expect(router.state.resolvedLocation?.pathname).toBe('/page')
        expect(warn.mock.calls).toEqual(
          outcome === 'throws'
            ? [
                [
                  'TanStack Router: the `context` of route "/page" failed during hydration and is ignored, because the route keeps the error or not-found the server rendered.',
                  new Error('context failed on the client'),
                ],
              ]
            : [],
        )
      },
    )

    test('a _notFound root restores its transported results like any other match', async () => {
      const rootBeforeLoad = vi.fn(() => ({ guard: 'client' }))
      const rootLoader = vi.fn(() => 'client')
      const rootRoute = new BaseRootRoute({
        notFoundComponent: () => 'not found',
        beforeLoad: rootBeforeLoad,
        loader: rootLoader,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/child',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([childRoute]),
        history: createMemoryHistory({ initialEntries: ['/child'] }),
        isServer: false,
      })
      const [root] = router.matchRoutes(router.stores.location.get())
      installPayload(router)
      mockWindow.$_TSR!.router!.matches = [
        {
          i: dehydrateSsrMatchId(root!.id),
          s: 'success',
          ssr: true,
          u: Date.now(),
          g: true,
          e: notFound(),
          b: { guard: 'server' },
          l: 'server',
        },
      ]

      await hydrate(router)

      expect(rootBeforeLoad).not.toHaveBeenCalled()
      expect(rootLoader).not.toHaveBeenCalled()
      expect(findMatch(router.state.matches, rootRoute.id)).toMatchObject({
        status: 'success',
        _notFound: true,
        context: { guard: 'server' },
        loaderData: 'server',
      })
    })

    test('a _notFound root ignores a failing context and loader hydrate, and says so in development', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const rootRoute = new BaseRootRoute({
        notFoundComponent: () => 'not found',
        context: () => {
          throw new Error('context failed')
        },
        loader: {
          handler: () => 'client',
          dehydrate: true,
          hydrate: () => {
            throw new Error('transform failed')
          },
        },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/child',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([childRoute]),
        history: createMemoryHistory({ initialEntries: ['/missing'] }),
        isServer: false,
      })
      installPayload(router, [{ g: true, l: 'server' }])

      await hydrate(router)

      expect(findMatch(router.state.matches, rootRoute.id)).toMatchObject({
        status: 'success',
        _notFound: true,
        context: {},
      })
      expect(router.state.resolvedLocation?.pathname).toBe('/missing')
      expect(warn.mock.calls).toEqual([
        [
          'TanStack Router: the `context` of route "__root__" failed during hydration and is ignored, because the route keeps the error or not-found the server rendered.',
          new Error('context failed'),
        ],
        [
          'TanStack Router: the `loader.hydrate` of route "__root__" failed during hydration and is ignored, because the route keeps the error or not-found the server rendered.',
          new Error('transform failed'),
        ],
      ])
    })

    test('a throwing context hydrate is named as such in development', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const handler = vi.fn(() => ({ value: 'client' }))
      const rootRoute = new BaseRootRoute({})
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        errorComponent: () => 'error',
        context: {
          handler,
          dehydrate: true,
          hydrate: () => {
            throw new Error('transform failed')
          },
        },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([pageRoute]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer: false,
      })
      installPayload(router, [
        {},
        { s: 'error', e: new Error('server'), m: { value: 'server' } },
      ])

      await hydrate(router)

      expect(handler).not.toHaveBeenCalled()
      expect(findMatch(router.state.matches, pageRoute.id)?.status).toBe(
        'error',
      )
      expect(warn.mock.calls).toEqual([
        [
          'TanStack Router: the `context.hydrate` of route "/page" failed during hydration and is ignored, because the route keeps the error or not-found the server rendered.',
          new Error('transform failed'),
        ],
      ])
    })

    // A failure above the terminal match cuts it: the client load runs it
    // again, so nothing was ignored.
    test.each(['context', 'beforeLoad.hydrate', 'loader.hydrate'] as const)(
      'its failing %s is not reported when an ancestor loader fails during hydration',
      async (failing) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const transformFailed = () => {
          throw new Error('transform failed')
        }
        let parentFails = true
        const childRuns = vi.fn()
        const rootRoute = new BaseRootRoute({})
        const parentRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/parent',
          errorComponent: () => 'error',
          loader: () => {
            if (parentFails) {
              parentFails = false
              throw new Error('parent failed on the client')
            }
            return 'parent'
          },
        })
        const childRoute = new BaseRoute({
          getParentRoute: () => parentRoute,
          path: '/child',
          errorComponent: () => 'error',
          context:
            failing === 'context'
              ? () => {
                  childRuns('context')
                  if (childRuns.mock.calls.length === 1) {
                    throw new Error('context failed on the client')
                  }
                  return {}
                }
              : undefined,
          beforeLoad:
            failing === 'beforeLoad.hydrate'
              ? {
                  handler: () => {
                    childRuns('beforeLoad')
                    return {}
                  },
                  dehydrate: true,
                  hydrate: transformFailed,
                }
              : undefined,
          loader:
            failing === 'loader.hydrate'
              ? {
                  handler: () => {
                    childRuns('loader')
                    return 'child'
                  },
                  dehydrate: true,
                  hydrate: transformFailed,
                }
              : undefined,
        })
        const router = createTestRouter({
          routeTree: rootRoute.addChildren([
            parentRoute.addChildren([childRoute]),
          ]),
          history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
          isServer: false,
        })
        installPayload(router, [
          {},
          {},
          {
            s: 'error',
            e: new Error('server'),
            ...(failing === 'beforeLoad.hydrate' ? { b: {} } : {}),
            ...(failing === 'loader.hydrate' ? { l: 'server' } : {}),
          },
        ])

        await hydrate(router)
        await router.load()

        // Only the ancestor's fallback is reported, not the child's ignored failure.
        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining(
            `route "${parentRoute.id}" failed during hydration`,
          ),
          expect.anything(),
        )
        // The client load ran the child's handler.
        expect(childRuns).toHaveBeenLastCalledWith(
          failing === 'context' ? 'context' : failing.split('.')[0],
        )
        expect(findMatch(router.state.matches, childRoute.id)?.status).toBe(
          'success',
        )
      },
    )

    test('a superseded hydration reports no failure of its terminal match', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const rootRoute = new BaseRootRoute({})
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        errorComponent: () => 'error',
        context: ({ abortController }) =>
          new Promise<never>((_, reject) => {
            abortController.signal.addEventListener('abort', () =>
              reject(new Error('aborted')),
            )
          }),
      })
      const otherRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([pageRoute, otherRoute]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer: false,
      })
      installPayload(router, [{}, { s: 'error', e: new Error('server') }])

      const hydration = hydrate(router)
      await new Promise((resolve) => setTimeout(resolve, 0))
      await router.navigate({ to: '/other' })
      await hydration

      expect(router.state.location.pathname).toBe('/other')
      expect(warn).not.toHaveBeenCalled()
    })
  })

  describe('a global not-found boundary below the root is not terminal', () => {
    // In fuzzy mode the deepest matched route with a notFoundComponent is the
    // global not-found boundary. The server ran its lifecycles, and its own
    // component renders, so it hydrates like any success match.
    const buildLayout =
      (client: { beforeLoad: number; loader: number }, failing?: string) =>
      (isServer: boolean) => {
        const run = (lifecycle: 'beforeLoad' | 'loader') => {
          if (isServer) {
            return 'server'
          }
          if (++client[lifecycle] === 1 && failing === lifecycle) {
            throw new Error(`${lifecycle} failed on the client`)
          }
          return 'client'
        }
        const rootRoute = new BaseRootRoute({})
        const layoutRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/layout',
          notFoundComponent: () => 'layout not found',
          beforeLoad: {
            handler: () => ({ guard: run('beforeLoad') }),
            dehydrate: false,
          },
          loader: { handler: () => run('loader'), dehydrate: false },
        })
        const knownRoute = new BaseRoute({
          getParentRoute: () => layoutRoute,
          path: '/known',
        })
        return createTestRouter({
          routeTree: rootRoute.addChildren([
            layoutRoute.addChildren([knownRoute]),
          ]),
          history: createMemoryHistory({ initialEntries: ['/layout/missing'] }),
          isServer,
        })
      }

    test('its non-transported beforeLoad and loader re-run in place', async () => {
      const client = { beforeLoad: 0, loader: 0 }

      const { server, router } = await roundTrip(buildLayout(client))

      expect(server[1]).toMatchObject({ status: 'success', _notFound: true })
      expect(client).toEqual({ beforeLoad: 1, loader: 1 })
      expect(router.state.matches[1]).toMatchObject({
        routeId: '/layout',
        status: 'success',
        _notFound: true,
        context: { guard: 'client' },
        loaderData: 'client',
      })
      expect(router.state.resolvedLocation?.pathname).toBe('/layout/missing')
    })

    test.each(['beforeLoad', 'loader'] as const)(
      'a failing %s makes it the pending boundary, and the client load re-runs it',
      async (failing) => {
        const client = { beforeLoad: 0, loader: 0 }

        const { router } = await roundTrip(buildLayout(client, failing))

        expect(router.state.matches[1]).toMatchObject({
          routeId: '/layout',
          status: 'pending',
        })
        expect(router.state.resolvedLocation).toBeUndefined()

        await router.load()

        // A loader runs after its beforeLoad succeeded.
        expect(client).toEqual({
          beforeLoad: 2,
          loader: failing === 'loader' ? 2 : 1,
        })
        expect(router.state.matches[1]).toMatchObject({
          routeId: '/layout',
          status: 'success',
          _notFound: true,
          context: { guard: 'client' },
          loaderData: 'client',
        })
        expect(router.state.resolvedLocation?.pathname).toBe('/layout/missing')
      },
    )
  })

  describe('a pending match is left to the client load', () => {
    test('an ssr: false match runs nothing during hydration', async () => {
      const beforeLoad = vi.fn(() => ({ guard: true }))
      const loader = vi.fn(() => 'client')
      const rootRoute = new BaseRootRoute({})
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        ssr: false,
        beforeLoad: { handler: beforeLoad },
        loader: { handler: loader },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([pageRoute]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer: false,
      })
      installPayload(router, [{}, { s: 'pending', ssr: false }])

      await hydrate(router)

      expect(beforeLoad).not.toHaveBeenCalled()
      expect(loader).not.toHaveBeenCalled()
      expect(findMatch(router.state.matches, pageRoute.id)?.status).toBe(
        'pending',
      )

      await router.load()

      expect(beforeLoad).toHaveBeenCalledTimes(1)
      expect(loader).toHaveBeenCalledTimes(1)
      expect(findMatch(router.state.matches, pageRoute.id)).toMatchObject({
        status: 'success',
        context: { guard: true },
        loaderData: 'client',
      })
    })

    test('its context failure during hydration is not ignored: the client load reports it', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const onError = vi.fn()
      const rootRoute = new BaseRootRoute({})
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        ssr: false,
        onError,
        context: () => {
          throw new Error('context failed')
        },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([pageRoute]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer: false,
      })
      installPayload(router, [{}, { s: 'pending', ssr: false }])

      await hydrate(router)
      await router.load()

      expect(warn).not.toHaveBeenCalled()
      expect(onError).toHaveBeenCalledTimes(1)
      expect(findMatch(router.state.matches, pageRoute.id)?.status).toBe(
        'error',
      )
    })
  })

  describe("a server failure at the client matching's global-not-found boundary keeps its transported status", () => {
    /**
     * A 404 URL makes the client's own matching flag a candidate `_notFound`
     * (the root in root mode, the fuzzy boundary otherwise). When the server
     * installed an error or notFound at that match its install cleared the
     * flag, so the payload carries no `g` and only the transported status
     * says what the server rendered there. Hydration must not settle that
     * candidate as the planned not-found boundary of a client lane.
     */
    test('fuzzy mode: an error match at the fuzzy boundary stays an error match', async () => {
      const build = (isServer: boolean) => {
        const rootRoute = new BaseRootRoute({})
        const postsRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/posts',
          beforeLoad: () => {
            throw new Error('posts guard failed')
          },
          errorComponent: () => 'posts error',
          notFoundComponent: () => 'posts not found',
        })
        const postRoute = new BaseRoute({
          getParentRoute: () => postsRoute,
          path: '/$postId',
        })
        return createTestRouter({
          routeTree: rootRoute.addChildren([
            postsRoute.addChildren([postRoute]),
          ]),
          history: createMemoryHistory({ initialEntries: ['/posts/1/extra'] }),
          isServer,
          notFoundMode: 'fuzzy',
        })
      }

      const { server, router } = await roundTrip(build)

      expect(server[1]).toMatchObject({ routeId: '/posts', status: 'error' })
      expect(router.state.matches[1]).toMatchObject({
        routeId: '/posts',
        status: 'error',
        _notFound: true,
        error: expect.objectContaining({ message: 'posts guard failed' }),
      })
      expect(
        _getRenderedMatches(router.state.matches).map((match) => match.routeId),
      ).toEqual(['__root__', '/posts'])
      expect(router.state.status).toBe('idle')
      expect(router.state.resolvedLocation?.pathname).toBe('/posts/1/extra')
    })

    test('root mode: an error match at the root stays an error match', async () => {
      const build = (isServer: boolean) => {
        const rootRoute = new BaseRootRoute({
          beforeLoad: () => {
            throw new Error('root guard failed')
          },
          errorComponent: () => 'root error',
          notFoundComponent: () => 'root not found',
        })
        const pageRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/page',
        })
        return createTestRouter({
          routeTree: rootRoute.addChildren([pageRoute]),
          history: createMemoryHistory({ initialEntries: ['/nope'] }),
          isServer,
          notFoundMode: 'root',
        })
      }

      const { server, router } = await roundTrip(build)

      expect(server[0]).toMatchObject({ routeId: '__root__', status: 'error' })
      expect(router.state.matches).toHaveLength(1)
      expect(router.state.matches[0]).toMatchObject({
        routeId: '__root__',
        status: 'error',
        _notFound: true,
        error: expect.objectContaining({ message: 'root guard failed' }),
      })
      expect(router.state.status).toBe('idle')
      expect(router.state.resolvedLocation?.pathname).toBe('/nope')
    })

    test('fuzzy mode: a notFound match at the fuzzy boundary stays a notFound match', async () => {
      const build = (isServer: boolean) => {
        const rootRoute = new BaseRootRoute({})
        const postsRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/posts',
          beforeLoad: () => {
            throw notFound()
          },
          notFoundComponent: () => 'posts not found',
        })
        const postRoute = new BaseRoute({
          getParentRoute: () => postsRoute,
          path: '/$postId',
        })
        return createTestRouter({
          routeTree: rootRoute.addChildren([
            postsRoute.addChildren([postRoute]),
          ]),
          history: createMemoryHistory({ initialEntries: ['/posts/1/extra'] }),
          isServer,
          notFoundMode: 'fuzzy',
        })
      }

      const { server, router } = await roundTrip(build)

      expect(server[1]).toMatchObject({ routeId: '/posts', status: 'notFound' })
      expect(router.state.matches[1]).toMatchObject({
        routeId: '/posts',
        status: 'notFound',
        _notFound: true,
      })
      expect(isNotFound(router.state.matches[1]?.error)).toBe(true)
      expect(
        _getRenderedMatches(router.state.matches).map((match) => match.routeId),
      ).toEqual(['__root__', '/posts'])
      expect(router.state.status).toBe('idle')
    })

    test('a _notFound candidate past the server terminal is neither loaded nor settled', async () => {
      const lazyFn = vi.fn(() =>
        Promise.resolve({
          options: { id: '/posts', component: () => 'posts' },
        }),
      )
      const build = (isServer: boolean) => {
        const rootRoute = new BaseRootRoute({
          beforeLoad: () => {
            throw new Error('root guard failed')
          },
          errorComponent: () => 'root error',
        })
        const postsRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/posts',
          notFoundComponent: () => 'posts not found',
        })
        if (!isServer) {
          postsRoute.lazyFn = lazyFn
        }
        const postRoute = new BaseRoute({
          getParentRoute: () => postsRoute,
          path: '/$postId',
        })
        return createTestRouter({
          routeTree: rootRoute.addChildren([
            postsRoute.addChildren([postRoute]),
          ]),
          history: createMemoryHistory({ initialEntries: ['/posts/1/extra'] }),
          isServer,
          notFoundMode: 'fuzzy',
        })
      }

      const { server, router } = await roundTrip(build)

      expect(server[0]).toMatchObject({ routeId: '__root__', status: 'error' })
      expect(router.state.matches[0]).toMatchObject({
        routeId: '__root__',
        status: 'error',
        error: expect.objectContaining({ message: 'root guard failed' }),
      })
      // The fuzzy boundary lies past the server's terminal match: an unloaded
      // structural match whose chunk the lane has no reason to fetch.
      expect(router.state.matches[1]).toMatchObject({
        routeId: '/posts',
        status: 'pending',
        _notFound: true,
      })
      expect(lazyFn).not.toHaveBeenCalled()
      expect(
        _getRenderedMatches(router.state.matches).map((match) => match.routeId),
      ).toEqual(['__root__'])
      expect(router.state.status).toBe('idle')
    })
  })

  describe('a redirect from an in-place re-run presents the redirecting match as a pending boundary', () => {
    // A transported wire value below the redirecting match must never be
    // published as loader data (a Date codec would render as a string).
    test.each(['beforeLoad', 'loader'] as const)(
      'thrown from %s: no descendant is published with its wire value, and the target loads from the verified prefix',
      async (lifecycle) => {
        const rootLoader = vi.fn(() => 'client root')
        const targetLoader = vi.fn(() => 'target')
        const childHydrate = vi.fn(
          ({ data }: { data: string }) => new Date(data),
        )
        const throwRedirect = vi.fn(() => {
          throw redirect({ to: '/target' })
        })
        const rootRoute = new BaseRootRoute({ loader: rootLoader })
        const parentRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/parent',
          beforeLoad:
            lifecycle === 'beforeLoad'
              ? { handler: throwRedirect, dehydrate: false }
              : undefined,
          loader:
            lifecycle === 'loader'
              ? { handler: throwRedirect, dehydrate: false }
              : undefined,
        })
        const childRoute = new BaseRoute({
          getParentRoute: () => parentRoute,
          path: '/child',
          loader: {
            handler: () => new Date(0),
            dehydrate: ({ data }: { data: Date }) => data.toISOString(),
            hydrate: childHydrate,
          },
        })
        const targetRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/target',
          loader: targetLoader,
        })
        const router = createTestRouter({
          routeTree: rootRoute.addChildren([
            parentRoute.addChildren([childRoute]),
            targetRoute,
          ]),
          history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
          isServer: false,
        })
        installPayload(router, [
          { l: 'server root' },
          {},
          { l: '2026-01-01T00:00:00.000Z' },
        ])
        const publications: Array<
          Array<{
            routeId: string
            status: string
            ssr: unknown
            loaderData: unknown
          }>
        > = []
        const setMatches = router.stores.setMatches
        vi.spyOn(router.stores, 'setMatches').mockImplementation((matches) => {
          publications.push(
            matches.map((match) => ({
              routeId: match.routeId,
              status: match.status,
              ssr: match.ssr,
              loaderData: match.loaderData,
            })),
          )
          setMatches(matches)
        })

        await hydrate(router)

        // The verified prefix is published as transported; the redirecting
        // match is the pending boundary. A child whose transform did not run
        // has no data yet, so it is not a success.
        expect(publications[0]).toEqual([
          {
            routeId: rootRoute.id,
            status: 'success',
            ssr: true,
            loaderData: 'server root',
          },
          expect.objectContaining({
            routeId: parentRoute.id,
            status: 'pending',
            ssr: false,
          }),
          lifecycle === 'loader'
            ? {
                routeId: childRoute.id,
                status: 'success',
                ssr: true,
                loaderData: new Date('2026-01-01T00:00:00.000Z'),
              }
            : {
                routeId: childRoute.id,
                status: 'pending',
                ssr: true,
                loaderData: undefined,
              },
        ])
        // Loaders start together after the serial phase, so a loader-phase
        // redirect comes after the child's transform ran.
        expect(childHydrate).toHaveBeenCalledTimes(
          lifecycle === 'loader' ? 1 : 0,
        )

        await router.load()

        expect(router.state.location.pathname).toBe('/target')
        expect(router.state.status).toBe('idle')
        for (const publication of publications) {
          for (const match of publication) {
            if (match.routeId === childRoute.id) {
              expect(typeof match.loaderData).not.toBe('string')
              if (match.status === 'success') {
                expect(match.loaderData).toBeInstanceOf(Date)
              }
            }
          }
        }
        expect(router.state.matches.map((match) => match.routeId)).toEqual([
          rootRoute.id,
          targetRoute.id,
        ])
        expect(
          findMatch(router.state.matches, targetRoute.id)?.loaderData,
        ).toBe('target')
        expect(targetLoader).toHaveBeenCalledTimes(1)
        expect(rootLoader).not.toHaveBeenCalled()
        expect(findMatch(router.state.matches, rootRoute.id)?.loaderData).toBe(
          'server root',
        )
        expect(throwRedirect).toHaveBeenCalledTimes(2)
      },
    )
  })

  describe('a cut descendant keeps its wire value out of the loader cache', () => {
    test('a redirect from an in-place beforeLoad: the client load runs the descendant loader instead of serving the wire value', async () => {
      let throwOnce = true
      const guard = vi.fn(() => {
        if (throwOnce) {
          throwOnce = false
          throw redirect({ to: '/target' })
        }
        return {}
      })
      const childHydrate = vi.fn(({ data }: { data: string }) => new Date(data))
      const childLoader = vi.fn(() => new Date(0))
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        beforeLoad: { handler: guard, dehydrate: false },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: {
          handler: childLoader,
          dehydrate: ({ data }: { data: Date }) => data.toISOString(),
          hydrate: childHydrate,
        },
      })
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
          targetRoute,
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer: false,
      })
      installPayload(router, [{}, {}, { l: '2026-01-01T00:00:00.000Z' }])

      await hydrate(router)
      // The guard passes in the client run, so the lane stays.
      await router.load()

      expect(guard).toHaveBeenCalledTimes(2)
      expect(router.state.location.pathname).toBe('/parent/child')
      // The serial phase stopped at the guard: the child's transform never
      // ran, so its wire value was neither loader data nor cached.
      expect(childHydrate).not.toHaveBeenCalled()
      expect(childLoader).toHaveBeenCalledTimes(1)
      const child = findMatch(router.state.matches, childRoute.id)
      expect(child?.status).toBe('success')
      expect(child?.loaderData).toBeInstanceOf(Date)
    })
  })

  describe('a cut descendant whose loader result was not sent is presented as pending', () => {
    // Its loader either did not run, or read the failed parent. Either way it
    // has no data to present, so it is not a success.
    test.each(['context', 'beforeLoad', 'loader'] as const)(
      'the parent %s fails during hydration',
      async (failing) => {
        let failOnce = true
        const parentHandler = () => {
          if (failOnce) {
            failOnce = false
            throw new Error(`parent ${failing} failed on the client`)
          }
          return {}
        }
        const build = (isServer: boolean) => {
          const rootRoute = new BaseRootRoute({})
          const parentRoute = new BaseRoute({
            getParentRoute: () => rootRoute,
            path: '/parent',
            errorComponent: () => 'error',
            context:
              failing === 'context' && !isServer ? parentHandler : undefined,
            beforeLoad:
              failing === 'beforeLoad'
                ? {
                    handler: isServer ? () => ({}) : parentHandler,
                    dehydrate: false,
                  }
                : undefined,
            loader:
              failing === 'loader'
                ? {
                    handler: isServer ? () => ({}) : parentHandler,
                    dehydrate: false,
                  }
                : undefined,
          })
          const childRoute = new BaseRoute({
            getParentRoute: () => parentRoute,
            path: '/child',
            loader: {
              handler: async ({ parentMatchPromise }) =>
                `child:${(await parentMatchPromise).status}`,
              dehydrate: false,
            },
          })
          return createTestRouter({
            routeTree: rootRoute.addChildren([
              parentRoute.addChildren([childRoute]),
            ]),
            history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
            isServer,
          })
        }
        let publications: ReturnType<typeof recordPublications> = []

        const { router } = await roundTrip(build, (client) => {
          publications = recordPublications(client)
        })

        expect(publications[0]).toEqual([
          expect.objectContaining({ routeId: '__root__', status: 'success' }),
          expect.objectContaining({ routeId: '/parent', status: 'pending' }),
          {
            routeId: '/parent/child',
            status: 'pending',
            loaderData: undefined,
          },
        ])

        await router.load()

        expect(findMatch(router.state.matches, '/parent/child')).toMatchObject({
          status: 'success',
          loaderData: 'child:success',
        })
      },
    )

    test.each(['plain', 'codec'] as const)(
      'a notFound boundary cut by its chunk keeps its server status (%s loader)',
      async (form) => {
        let chunkFails = true
        const build = (isServer: boolean) => {
          const NotFound = Object.assign(() => 'not found', {
            preload: async () => {
              if (!isServer && chunkFails) {
                chunkFails = false
                throw new Error('chunk failed during hydration')
              }
            },
          })
          const rootRoute = new BaseRootRoute({})
          const boundaryRoute = new BaseRoute({
            getParentRoute: () => rootRoute,
            path: '/boundary',
            notFoundComponent: NotFound,
            loader:
              form === 'codec'
                ? {
                    handler: () => ({ list: ['a', 'b'] }),
                    dehydrate: ({ data }) => data.list.join(','),
                    hydrate: ({ data }) => ({ list: data.split(',') }),
                  }
                : () => ({ list: ['a', 'b'] }),
          })
          const childRoute = new BaseRoute({
            getParentRoute: () => boundaryRoute,
            path: '/child',
            loader: () => {
              throw notFound()
            },
          })
          return createTestRouter({
            routeTree: rootRoute.addChildren([
              boundaryRoute.addChildren([childRoute]),
            ]),
            history: createMemoryHistory({
              initialEntries: ['/boundary/child'],
            }),
            isServer,
          })
        }
        let publications: ReturnType<typeof recordPublications> = []

        const { router } = await roundTrip(build, (client) => {
          publications = recordPublications(client)
        })

        expect(publications[0]![1]).toMatchObject({
          routeId: '/boundary',
          status: 'notFound',
        })

        await router.load()

        expect(findMatch(router.state.matches, '/boundary')).toMatchObject({
          status: 'notFound',
          loaderData: { list: ['a', 'b'] },
        })
      },
    )
  })

  describe('the client load after a failure in the parallel loader pass', () => {
    test('re-runs a child loader that read the failed parent and serves transported data below the boundary from the cache', async () => {
      let clientParentRuns = 0
      const childRuns: Array<string> = []
      const grandchildHandler = vi.fn(() => new Date(0))
      const grandchildHydrate = vi.fn(
        ({ data }: { data: string }) => new Date(data),
      )
      const build = (isServer: boolean) => {
        const rootRoute = new BaseRootRoute({})
        const parentRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/parent',
          errorComponent: () => 'error',
          loader: {
            handler: () => {
              if (!isServer && ++clientParentRuns === 1) {
                throw new Error('parent failed during hydration')
              }
              return 'parent-ok'
            },
            dehydrate: false,
          },
        })
        const childRoute = new BaseRoute({
          getParentRoute: () => parentRoute,
          path: '/child',
          loader: {
            handler: async ({ parentMatchPromise }) => {
              const parent = await parentMatchPromise
              const value = `${parent.status}:${String(parent.loaderData)}`
              if (!isServer) {
                childRuns.push(value)
              }
              return value
            },
            dehydrate: false,
          },
        })
        const grandchildRoute = new BaseRoute({
          getParentRoute: () => childRoute,
          path: '/grandchild',
          loader: {
            handler: isServer ? () => new Date(0) : grandchildHandler,
            dehydrate: ({ data }) => data.toISOString(),
            hydrate: grandchildHydrate,
          },
        })
        return createTestRouter({
          routeTree: rootRoute.addChildren([
            parentRoute.addChildren([
              childRoute.addChildren([grandchildRoute]),
            ]),
          ]),
          history: createMemoryHistory({
            initialEntries: ['/parent/child/grandchild'],
          }),
          isServer,
        })
      }

      const { router } = await roundTrip(build)

      // During hydration the child read the parent's failure.
      expect(childRuns).toEqual(['error:undefined'])

      await router.load()

      expect(router.state.matches.map((match) => match.loaderData)).toEqual([
        undefined,
        'parent-ok',
        'success:parent-ok',
        new Date(0),
      ])
      // The child's hydration result was discarded and its loader ran again.
      expect(childRuns).toEqual(['error:undefined', 'success:parent-ok'])
      // The grandchild's transported value, after its transform, was cached.
      expect(grandchildHydrate).toHaveBeenCalledTimes(1)
      expect(grandchildHandler).not.toHaveBeenCalled()
    })

    test('lifecycles that ran during hydration at and below the boundary run again, onError once', async () => {
      const error = new Error('parent failed on the client')
      const onError = vi.fn()
      const client = {
        parentLoader: 0,
        childContext: 0,
        childBeforeLoad: 0,
        childLoader: 0,
      }
      const count = (isServer: boolean, key: keyof typeof client) => {
        if (!isServer) {
          client[key]++
        }
      }
      const build = (isServer: boolean) => {
        const rootRoute = new BaseRootRoute({})
        const parentRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/parent',
          errorComponent: () => 'error',
          onError: isServer ? undefined : onError,
          loader: {
            handler: () => {
              count(isServer, 'parentLoader')
              if (!isServer) {
                throw error
              }
              return 'parent'
            },
            dehydrate: false,
          },
        })
        const childRoute = new BaseRoute({
          getParentRoute: () => parentRoute,
          path: '/child',
          context: () => {
            count(isServer, 'childContext')
            return {}
          },
          beforeLoad: {
            handler: () => {
              count(isServer, 'childBeforeLoad')
              return {}
            },
            dehydrate: false,
          },
          loader: {
            handler: () => {
              count(isServer, 'childLoader')
              return 'child'
            },
            dehydrate: false,
          },
        })
        return createTestRouter({
          routeTree: rootRoute.addChildren([
            parentRoute.addChildren([childRoute]),
          ]),
          history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
          isServer,
        })
      }

      const { router } = await roundTrip(build)

      expect(client).toEqual({
        parentLoader: 1,
        childContext: 1,
        childBeforeLoad: 1,
        childLoader: 1,
      })
      expect(onError).not.toHaveBeenCalled()

      await router.load()

      expect(findMatch(router.state.matches, '/parent')).toMatchObject({
        status: 'error',
        error,
      })
      // The child's context memo is handed to the client load; its beforeLoad
      // runs on every load and its loader result from hydration is discarded.
      expect(client).toEqual({
        parentLoader: 2,
        childContext: 1,
        childBeforeLoad: 2,
        childLoader: 2,
      })
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(error)
    })
  })

  describe('an in-place loader failure below a pending boundary', () => {
    test('the client load ends the lane at the error match, which cuts the pending descendant', async () => {
      const error = new Error('loader failed')
      const parentLoader = vi.fn(() => {
        throw error
      })
      const childLoader = vi.fn(() => 'client child')
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        errorComponent: () => 'error',
        loader: { handler: parentLoader, dehydrate: false },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        ssr: false,
        loader: childLoader,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer: false,
      })
      installPayload(router, [{}, {}, { s: 'pending', ssr: false }])

      await hydrate(router)

      // The failing match, not the ssr: false descendant, is the boundary.
      expect(findMatch(router.state.matches, parentRoute.id)?.status).toBe(
        'pending',
      )

      await router.load()

      expect(findMatch(router.state.matches, parentRoute.id)).toMatchObject({
        status: 'error',
        error,
      })
      expect(
        _getRenderedMatches(router.state.matches).map((match) => match.routeId),
      ).toEqual([rootRoute.id, parentRoute.id])
      expect(router.state.status).toBe('idle')
      expect(router.state.resolvedLocation?.pathname).toBe('/parent/child')
      expect(parentLoader).toHaveBeenCalledTimes(2)
      // As in any client lane, the descendant's loader ran in parallel and the
      // error boundary cut it.
      expect(childLoader).toHaveBeenCalledTimes(1)
    })

    test('a data-only error match that is the pending boundary gets no asset end from a verified descendant', async () => {
      const error = new Error('loader failed')
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        ssr: 'data-only',
        errorComponent: () => 'error',
        loader: {
          handler: () => {
            throw error
          },
          dehydrate: false,
        },
      })
      const childLoader = vi.fn(() => 'client child')
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
        isServer: false,
      })
      installPayload(router, [
        {},
        { ssr: 'data-only' },
        { ssr: 'data-only', l: 'server child' },
      ])

      await hydrate(router)

      // The data-only boundary presents as pending for the client load that
      // follows. Its in-place loader failed, so it is the terminal match: the
      // server-rendered descendant proves nothing about it and its assets
      // stay out of the lane until that load commits.
      const parentMatch = findMatch(router.state.matches, parentRoute.id)
      expect(parentMatch).toMatchObject({ status: 'pending' })
      expect(parentMatch?._assetEnd).toBeUndefined()
      expect(
        _getAssetMatches(router.state.matches).map((match) => match.routeId),
      ).toEqual([rootRoute.id, parentRoute.id])
      expect(childLoader).not.toHaveBeenCalled()
    })
  })

  describe('a failed transform clears the transported loader data of its match', () => {
    test.each(['context', 'beforeLoad'] as const)(
      'a throwing %s hydrate leaves neither the wire value nor the data, and the handler recovers in the client load',
      async (lifecycle) => {
        const transformError = new Error('transform failed')
        const handler = vi.fn(() => ({ value: 'client' }))
        const loaderHydrate = vi.fn(({ data }: { data: string }) => data)
        const loader = vi.fn(() => 'client')
        const option = {
          handler,
          dehydrate: true as const,
          hydrate: () => {
            throw transformError
          },
        }
        const rootRoute = new BaseRootRoute({})
        const pageRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/page',
          errorComponent: () => 'error',
          context: lifecycle === 'context' ? option : undefined,
          beforeLoad: lifecycle === 'beforeLoad' ? option : undefined,
          loader: { handler: loader, dehydrate: true, hydrate: loaderHydrate },
        })
        const router = createTestRouter({
          routeTree: rootRoute.addChildren([pageRoute]),
          history: createMemoryHistory({ initialEntries: ['/page'] }),
          isServer: false,
        })
        installPayload(router, [
          {},
          {
            ...(lifecycle === 'context'
              ? { m: { value: 'server' } }
              : { b: { value: 'server' } }),
            l: 'server',
          },
        ])

        await hydrate(router)

        const match = findMatch(router.state.matches, pageRoute.id)
        expect(match).toMatchObject({ status: 'pending', error: undefined })
        expect(match).not.toHaveProperty('loaderData')
        expect(loaderHydrate).not.toHaveBeenCalled()
        expect(handler).not.toHaveBeenCalled()
        expect(loader).not.toHaveBeenCalled()

        await router.load()

        expect(handler).toHaveBeenCalledTimes(1)
        expect(loader).toHaveBeenCalledTimes(1)
        expect(findMatch(router.state.matches, pageRoute.id)).toMatchObject({
          status: 'success',
          context: { value: 'client' },
          loaderData: 'client',
        })
      },
    )
  })

  describe('restored context and router.invalidate()', () => {
    test('revalidate: true re-runs the handler once after a restored m', async () => {
      const handler = vi.fn(() => ({ session: 'client' }))
      const rootRoute = new BaseRootRoute({})
      const authedRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/authed',
        context: { handler, dehydrate: true, revalidate: true },
        beforeLoad: ({ context }) => ({ seen: context.session }),
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([authedRoute]),
        history: createMemoryHistory({ initialEntries: ['/authed'] }),
        isServer: false,
      })
      installPayload(router, [{}, { m: { session: 'server' } }])

      await hydrate(router)

      expect(handler).not.toHaveBeenCalled()
      expect(findMatch(router.state.matches, authedRoute.id)?.context).toEqual({
        session: 'server',
        seen: 'server',
      })

      // A plain load keeps the restored memo.
      await router.load()
      expect(handler).not.toHaveBeenCalled()

      await router.invalidate()

      expect(handler).toHaveBeenCalledTimes(1)
      expect(findMatch(router.state.matches, authedRoute.id)?.context).toEqual({
        session: 'client',
        seen: 'client',
      })

      await router.load()
      expect(handler).toHaveBeenCalledTimes(1)
    })

    test('a revalidate function receives the restored value as prev', async () => {
      const handler = vi.fn(() => ({ session: 'client', counter: 0 }))
      const revalidate = vi.fn(({ prev }: { prev: any }) => ({
        session: prev.session,
        counter: prev.counter + 1,
      }))
      const rootRoute = new BaseRootRoute({})
      const authedRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/authed',
        context: { handler, dehydrate: true, revalidate },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([authedRoute]),
        history: createMemoryHistory({ initialEntries: ['/authed'] }),
        isServer: false,
      })
      installPayload(router, [{}, { m: { session: 'server', counter: 0 } }])

      await hydrate(router)
      await router.invalidate()

      expect(handler).not.toHaveBeenCalled()
      expect(revalidate).toHaveBeenCalledTimes(1)
      expect(revalidate).toHaveBeenCalledWith(
        expect.objectContaining({ prev: { session: 'server', counter: 0 } }),
      )
      expect(findMatch(router.state.matches, authedRoute.id)?.context).toEqual({
        session: 'server',
        counter: 1,
      })
    })
  })

  describe('beforeLoad hydrate', () => {
    test('an async hydrate is awaited before the child context and the loaders', async () => {
      const order: Array<string> = []
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        beforeLoad: {
          handler: () => ({ auth: 'client' }),
          dehydrate: true,
          hydrate: async ({ data }: { data: { auth: string } }) => {
            order.push('hydrate start')
            await new Promise((resolve) => setTimeout(resolve, 5))
            order.push('hydrate end')
            return { auth: `${data.auth}+hydrated` }
          },
        },
        loader: {
          handler: ({ context }: { context: any }) => {
            order.push('parent loader')
            return context.auth
          },
          dehydrate: false,
        },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        context: ({ context }) => {
          order.push('child context')
          return { fromChild: context.auth }
        },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer: false,
      })
      installPayload(router, [{}, { b: { auth: 'server' } }, {}])

      await hydrate(router)

      expect(order).toEqual([
        'hydrate start',
        'hydrate end',
        'child context',
        'parent loader',
      ])
      expect(findMatch(router.state.matches, parentRoute.id)).toMatchObject({
        status: 'success',
        context: { auth: 'server+hydrated' },
        loaderData: 'server+hydrated',
      })
      expect(findMatch(router.state.matches, childRoute.id)?.context).toEqual({
        auth: 'server+hydrated',
        fromChild: 'server+hydrated',
      })
    })

    test.each([
      ['redirect', () => redirect({ to: '/target' })],
      ['notFound', () => notFound()],
    ] as const)(
      'a %s thrown from hydrate is a failure like any other: the handler recovers in the client load',
      async (_name, create) => {
        const handler = vi.fn(() => ({ auth: 'client' }))
        const onError = vi.fn()
        const rootRoute = new BaseRootRoute({})
        const pageRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/page',
          errorComponent: () => 'error',
          notFoundComponent: () => 'not found',
          onError,
          beforeLoad: {
            handler,
            dehydrate: true,
            hydrate: () => {
              throw create()
            },
          },
        })
        const targetRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/target',
        })
        const router = createTestRouter({
          routeTree: rootRoute.addChildren([pageRoute, targetRoute]),
          history: createMemoryHistory({ initialEntries: ['/page'] }),
          isServer: false,
        })
        installPayload(router, [{}, { b: {} }])

        await hydrate(router)

        expect(findMatch(router.state.matches, pageRoute.id)?.status).toBe(
          'pending',
        )

        await router.load()

        expect(handler).toHaveBeenCalledTimes(1)
        expect(onError).not.toHaveBeenCalled()
        expect(findMatch(router.state.matches, pageRoute.id)).toMatchObject({
          status: 'success',
          context: { auth: 'client' },
        })
        expect(router.state.location.pathname).toBe('/page')
        expect(router.state.resolvedLocation?.pathname).toBe('/page')
      },
    )
  })
  describe('a loader run during hydration holds its flight like a client lane', () => {
    test('the flight stays live across the handoff and aborts when the match departs', async () => {
      let signal!: AbortSignal
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: {
          handler: ({
            abortController,
          }: {
            abortController: AbortController
          }) => {
            signal = abortController.signal
            return 'client parent'
          },
          dehydrate: false,
        },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        ssr: false,
        loader: () => 'child',
      })
      const otherRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
          otherRoute,
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer: false,
      })
      installPayload(router, [{}, {}, { s: 'pending', ssr: false }])

      await hydrate(router)
      await router.load()

      expect(router.state.matches.map((match) => match.status)).toEqual([
        'success',
        'success',
        'success',
      ])
      expect(signal.aborted).toBe(false)

      await router.navigate({ to: '/other' })

      expect(signal.aborted).toBe(true)
    })

    test('a superseded hydration leaves no settled flight for a later load to reuse', async () => {
      let calls = 0
      let releaseHead!: () => void
      const headGate = new Promise<void>((resolve) => (releaseHead = resolve))
      const rootRoute = new BaseRootRoute({
        head: async () => {
          await headGate
          return {}
        },
      })
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: { handler: () => `client parent ${++calls}`, dehydrate: false },
      })
      const otherRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([parentRoute, otherRoute]),
        history: createMemoryHistory({ initialEntries: ['/parent'] }),
        isServer: false,
      })
      installPayload(router)

      const hydration = hydrate(router)
      await vi.waitFor(() => expect(calls).toBe(1))
      // Hydration now waits for the root's head.
      const navigation = router.navigate({ to: '/other' })
      releaseHead()
      await hydration
      await navigation

      expect(router.state.location.pathname).toBe('/other')

      await router.navigate({ to: '/parent' })

      expect(calls).toBe(2)
      expect(findMatch(router.state.matches, parentRoute.id)?.loaderData).toBe(
        'client parent 2',
      )
    })
    test('a load that adopts the flight of a superseded hydration reports its error once', async () => {
      let releaseLoader!: () => void
      const loaderGate = new Promise<void>(
        (resolve) => (releaseLoader = resolve),
      )
      let releaseGuard!: () => void
      const guardGate = new Promise<void>((resolve) => (releaseGuard = resolve))
      const error = new Error('loader failed')
      const onError = vi.fn()
      const loader = vi.fn(async () => {
        await loaderGate
        throw error
      })
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        errorComponent: () => 'error',
        onError,
        beforeLoad: {
          handler: async () => {
            await guardGate
            return {}
          },
          dehydrate: true,
        },
        loader: { handler: loader, dehydrate: false },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([parentRoute]),
        history: createMemoryHistory({ initialEntries: ['/parent'] }),
        isServer: false,
      })
      installPayload(router, [{}, { b: {} }])

      const hydration = hydrate(router)
      await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
      // A synchronous load reaches the guard before hydration releases the
      // running loader, so the load adopts it.
      const load = router.load({ sync: true })
      await hydration
      releaseGuard()
      await new Promise((resolve) => setTimeout(resolve, 0))
      releaseLoader()
      await load

      expect(loader).toHaveBeenCalledTimes(1)
      expect(findMatch(router.state.matches, parentRoute.id)).toMatchObject({
        status: 'error',
        error,
      })
      expect(onError).toHaveBeenCalledTimes(1)
    })
  })
})
