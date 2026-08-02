import {
  afterEach,
  beforeEach,
  describe,
  expect,
  onTestFinished,
  test,
  vi,
} from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  redirect,
} from '../src'
import { hydrate } from '../src/ssr/client'
import { dehydrateSsrMatchId } from '../src/ssr/ssr-match-id'
import { createTestRouter } from './routerTestUtils'
import type { AnyRouter } from '../src'
import type { TsrSsrGlobal } from '../src/ssr/types'

function installHydrationPayload(
  mockWindow: { $_TSR?: TsrSsrGlobal },
  router: AnyRouter,
) {
  const matches = router.matchRoutes(router.stores.location.get())
  mockWindow.$_TSR = {
    router: {
      manifest: { routes: {} },
      dehydratedData: { source: 'server' },
      matches: matches.map((match) => ({
        i: dehydrateSsrMatchId(match.id),
        s: 'success' as const,
        l:
          match.routeId === matches.at(-1)?.routeId ? 'server data' : undefined,
        ssr: true,
        u: Date.now(),
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

describe('hydration abort authority', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }

  beforeEach(() => {
    mockWindow = {}
    vi.stubGlobal('window', mockWindow)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('keeps a reentrant load authoritative when the custom hydrate callback throws', async () => {
    const hydrateError = new Error('custom hydrate failed')
    const beforeLoad = vi.fn(() => ({ source: 'client' }))
    const loader = vi.fn(
      ({ context }: { context: { source?: string } }) => context.source,
    )
    const rootRoute = new BaseRootRoute({ beforeLoad })
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
    installHydrationPayload(mockWindow, router)

    let load: Promise<void> | undefined
    router.options.hydrate = () => {
      load = router.load()
      throw hydrateError
    }

    await expect(hydrate(router)).rejects.toBe(hydrateError)
    expect(load).toBeDefined()
    await load

    expect(router.state.location.pathname).toBe('/page')
    expect(router.state.resolvedLocation?.pathname).toBe('/page')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'success',
      loaderData: 'client',
    })
    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('keeps hydration current when route context aborts its controller', async () => {
    const routeContext = vi.fn(
      ({ abortController }: { abortController: AbortController }) => {
        abortController.abort()
        return { hydrated: true }
      },
    )
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: routeContext,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: false,
    })
    installHydrationPayload(mockWindow, router)

    await expect(hydrate(router)).resolves.toBeUndefined()

    expect(routeContext).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/page')
    expect(router.state.resolvedLocation?.pathname).toBe('/page')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'success',
      context: { hydrated: true },
    })
  })

  test('a navigation aborts the surviving hydrate after synchronous hydration supersession', async () => {
    const firstGate = createControlledPromise<void>()
    const secondGate = createControlledPromise<void>()
    const firstStarted = createControlledPromise<void>()
    const secondStarted = createControlledPromise<void>()
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
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
    installHydrationPayload(mockWindow, router)

    let calls = 0
    router.options.hydrate = () => {
      calls++
      if (calls === 1) {
        firstStarted.resolve()
        return firstGate
      }
      secondStarted.resolve()
      return secondGate
    }

    const first = hydrate(router)
    onTestFinished(() => firstGate.resolve())
    await firstStarted

    const second = hydrate(router)
    await secondStarted
    await expect(first).resolves.toBeUndefined()

    await router.navigate({ to: '/target' })
    secondGate.resolve()
    await expect(second).resolves.toBeUndefined()

    expect(calls).toBe(2)
    expect(router.state.location.pathname).toBe('/target')
    expect(router.state.resolvedLocation?.pathname).toBe('/target')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
    })
  })

  test('a synchronous redirecting navigation supersedes custom hydration', async () => {
    const hydrateGate = createControlledPromise<void>()
    const hydrateStarted = createControlledPromise<void>()
    const oldBeforeLoad = vi.fn()
    const targetLoader = vi.fn(() => 'target data')
    const rootRoute = new BaseRootRoute({})
    const oldRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/old',
      beforeLoad: oldBeforeLoad,
    })
    const redirectRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/redirect',
      beforeLoad: () => {
        throw redirect({ to: '/target' })
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loader: targetLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([oldRoute, redirectRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/old'] }),
      isServer: false,
    })
    installHydrationPayload(mockWindow, router)

    let navigation: Promise<void> | undefined
    router.options.hydrate = () => {
      hydrateStarted.resolve()
      navigation = router.navigate({ to: '/redirect' })
      return hydrateGate
    }

    const hydration = hydrate(router)
    onTestFinished(() => hydrateGate.resolve())
    await hydrateStarted
    await expect(hydration).resolves.toBeUndefined()
    expect(navigation).toBeDefined()
    await navigation

    expect(router.history.location.pathname).toBe('/target')
    expect(router.state.location.pathname).toBe('/target')
    expect(router.state.resolvedLocation?.pathname).toBe('/target')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
      loaderData: 'target data',
    })
    expect(oldBeforeLoad).not.toHaveBeenCalled()
    expect(targetLoader).toHaveBeenCalledTimes(1)
  })

  test('a history-changing navigation aborts a pending hydration chunk', async () => {
    const oldChunkGate = createControlledPromise<void>()
    const oldChunkStarted = createControlledPromise<void>()
    const oldContext = vi.fn(() => ({ source: 'old' }))
    const oldHead = vi.fn(() => ({ meta: [{ title: 'Old' }] }))
    const OldComponent = Object.assign(() => null, {
      preload: () => {
        oldChunkStarted.resolve()
        return oldChunkGate
      },
    })
    const newLoader = vi.fn(() => 'new data')
    const rootRoute = new BaseRootRoute({})
    const oldRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/old',
      component: OldComponent,
      context: oldContext,
      head: oldHead,
    })
    const newRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/new',
      loader: newLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([oldRoute, newRoute]),
      history: createMemoryHistory({ initialEntries: ['/old'] }),
      isServer: false,
    })
    installHydrationPayload(mockWindow, router)

    const hydration = hydrate(router)
    onTestFinished(() => oldChunkGate.resolve())
    await oldChunkStarted

    const navigation = router.navigate({
      to: '/new',
      state: { source: 'new history entry' } as any,
    })
    await expect(hydration).resolves.toBeUndefined()
    await navigation

    expect(router.history.location).toMatchObject({
      pathname: '/new',
      state: { source: 'new history entry' },
    })
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: newRoute.id,
      status: 'success',
      loaderData: 'new data',
    })
    expect(oldContext).not.toHaveBeenCalled()
    expect(oldHead).not.toHaveBeenCalled()
    expect(newLoader).toHaveBeenCalledTimes(1)
  })
})
