import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// https://github.com/TanStack/router/issues/2980
// Repeated child preloads must reuse data from the accepted active parent
// generation instead of rerunning its loader.
test('#2980: repeated child preloads do not rerun a stale active parent loader', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000)

  const layoutLoader = vi.fn(() => 'layout data')
  const childLoader = vi.fn((childId: string) => `child ${childId}`)
  const rootRoute = new BaseRootRoute({})
  const layoutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/layout',
    staleTime: 10,
    loader: layoutLoader,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '$childId',
    loader: ({ params }) => childLoader(params.childId),
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([layoutRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/layout'] }),
  })

  await router.load()
  expect(layoutLoader).toHaveBeenCalledTimes(1)
  vi.setSystemTime(2_000)

  await router.preloadRoute({
    to: '/layout/$childId',
    params: { childId: 'one' },
  })
  expect(layoutLoader).toHaveBeenCalledTimes(1)
  expect(childLoader).toHaveBeenNthCalledWith(1, 'one')

  await router.preloadRoute({
    to: '/layout/$childId',
    params: { childId: 'two' },
  })

  expect(layoutLoader).toHaveBeenCalledTimes(1)
  expect(childLoader).toHaveBeenCalledTimes(2)
  expect(childLoader).toHaveBeenNthCalledWith(2, 'two')
})

// Public contract: the public stale/gc options determine whether user loader
// code runs. A read-only preload must not silently shorten a navigation-owned
// cache entry's lifetime.
test('fresh navigation data keeps its gc policy when a preload reuses it', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000)

  let revision = 0
  const loader = vi.fn(() => ++revision)
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const reportsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/reports',
    gcTime: 30 * 60_000,
    preloadGcTime: 30_000,
    preloadStaleTime: 10 * 60_000,
    staleTime: Infinity,
    loader,
  })
  const otherRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, reportsRoute, otherRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.navigate({ to: '/reports' })
  await router.navigate({ to: '/' })
  expect(loader).toHaveBeenCalledTimes(1)

  vi.setSystemTime(61_000)
  await router.preloadRoute({ to: '/reports' })
  await router.navigate({ to: '/other' })
  await router.navigate({ to: '/reports' })
  expect(loader).toHaveBeenCalledTimes(1)
  expect(
    router.state.matches.find((match) => match.routeId === reportsRoute.id)
      ?.loaderData,
  ).toBe(1)

  await router.navigate({ to: '/' })
  vi.setSystemTime(1_000 + 31 * 60_000)
  await router.navigate({ to: '/other' })
  await router.navigate({ to: '/reports' })
  expect(loader).toHaveBeenCalledTimes(2)
  expect(
    router.state.matches.find((match) => match.routeId === reportsRoute.id)
      ?.loaderData,
  ).toBe(2)
})

// Public contract: clearCache must remain authoritative even if an older
// preload finishes unrelated asset work after the clear.
test('clearCache during an in-flight preload cannot resurrect reused accepted data', async () => {
  const headGate = createControlledPromise<{
    meta: Array<{ title: string }>
  }>()
  let revision = 0
  let headCalls = 0
  const loader = vi.fn(() => ++revision)
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const reportsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/reports',
    staleTime: Infinity,
    preloadStaleTime: Infinity,
    loader,
    head: () => {
      headCalls++
      return headCalls === 1 ? { meta: [{ title: 'Reports' }] } : headGate
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, reportsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.navigate({ to: '/reports' })
  await router.navigate({ to: '/' })
  expect(loader).toHaveBeenCalledTimes(1)

  const preload = router.preloadRoute({ to: '/reports' })
  await vi.waitFor(() => expect(headCalls).toBe(2))
  expect(headGate.status).toBe('pending')
  router.clearCache()
  headGate.resolve({ meta: [{ title: 'Preloaded Reports' }] })
  await preload

  await router.navigate({ to: '/reports' })
  expect(loader).toHaveBeenCalledTimes(2)
  expect(
    router.state.matches.find((match) => match.routeId === reportsRoute.id)
      ?.loaderData,
  ).toBe(2)
})

test('clearCache cancels a brand-new in-flight preload before it can populate the cache', async () => {
  const firstLoad = createControlledPromise<string>()
  const loader = vi
    .fn<() => string | Promise<string>>()
    .mockImplementationOnce(() => firstLoad)
    .mockReturnValue('navigation data')
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const reportsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/reports',
    preloadStaleTime: Infinity,
    staleTime: Infinity,
    loader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, reportsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const preload = router.preloadRoute({ to: '/reports' })
  await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

  router.clearCache()
  firstLoad.resolve('obsolete preload data')
  await preload
  await router.navigate({ to: '/reports' })

  expect(loader).toHaveBeenCalledTimes(2)
  expect(
    router.state.matches.find((match) => match.routeId === reportsRoute.id)
      ?.loaderData,
  ).toBe('navigation data')
})

test('clearCache installs replacement authorities before abort listeners reenter', async () => {
  let reentrantNavigation: Promise<void> | undefined
  let router: ReturnType<typeof createTestRouter>
  const loader = vi.fn(
    ({ abortController }: { abortController: AbortController }) => {
      const generation = loader.mock.calls.length
      if (generation !== 2) {
        return `generation ${generation}`
      }
      return new Promise<string>((_resolve, reject) => {
        abortController.signal.addEventListener(
          'abort',
          () => {
            reentrantNavigation = router.navigate({ to: '/target' })
            reject(abortController.signal.reason)
          },
          { once: true },
        )
      })
    },
  )
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    staleTime: Infinity,
    preloadStaleTime: 0,
    loader,
  })
  router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.navigate({ to: '/target' })
  await router.navigate({ to: '/' })

  const preload = router.preloadRoute({ to: '/target' })
  await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
  router.clearCache()

  await reentrantNavigation
  await preload
  expect(loader).toHaveBeenCalledTimes(3)
  expect(router.state.location.pathname).toBe('/target')
  expect(router.state.matches.at(-1)?.loaderData).toBe('generation 3')
})

test('clearCache detaches every discarded flight before abort listeners reenter', async () => {
  let reentrantNavigation: Promise<void> | undefined
  let router: ReturnType<typeof createTestRouter>
  const firstBeforeLoad = vi.fn(
    ({ abortController }: { abortController: AbortController }) =>
      new Promise<void>((_resolve, reject) => {
        abortController.signal.addEventListener(
          'abort',
          () => {
            reentrantNavigation = router.navigate({ to: '/second' })
            reject(abortController.signal.reason)
          },
          { once: true },
        )
      }),
  )
  const secondLoader = vi.fn(
    ({ abortController }: { abortController: AbortController }) => {
      const generation = secondLoader.mock.calls.length
      if (generation > 1) {
        return `generation ${generation}`
      }
      return new Promise<string>((_resolve, reject) => {
        abortController.signal.addEventListener(
          'abort',
          () => reject(abortController.signal.reason),
          { once: true },
        )
      })
    },
  )
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const firstRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    beforeLoad: firstBeforeLoad,
  })
  const secondRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/second',
    loader: secondLoader,
  })
  router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, firstRoute, secondRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const firstPreload = router.preloadRoute({ to: '/first' })
  await vi.waitFor(() => expect(firstBeforeLoad).toHaveBeenCalledOnce())
  const secondPreload = router.preloadRoute({ to: '/second' })
  await vi.waitFor(() => expect(secondLoader).toHaveBeenCalledOnce())

  router.clearCache()

  await reentrantNavigation
  await Promise.all([firstPreload, secondPreload])
  expect(secondLoader).toHaveBeenCalledTimes(2)
  expect(router.state.location.pathname).toBe('/second')
  expect(router.state.matches.at(-1)?.loaderData).toBe('generation 2')
})

test('a throwing clearCache filter leaves every preload owned', async () => {
  const firstGate = createControlledPromise<string>()
  const secondGate = createControlledPromise<string>()
  let firstSignal: AbortSignal | undefined
  let secondSignal: AbortSignal | undefined
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const firstRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    loader: ({ abortController }) => {
      firstSignal = abortController.signal
      return firstGate
    },
  })
  const secondRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/second',
    loader: ({ abortController }) => {
      secondSignal = abortController.signal
      return secondGate
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, firstRoute, secondRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const firstPreload = router.preloadRoute({ to: '/first' })
  const secondPreload = router.preloadRoute({ to: '/second' })
  await vi.waitFor(() => {
    expect(firstSignal).toBeDefined()
    expect(secondSignal).toBeDefined()
  })

  const failure = new Error('filter failed')
  expect(() =>
    router.clearCache({
      filter: (match) => {
        if (match.routeId === firstRoute.id) {
          return true
        }
        if (match.routeId === secondRoute.id) {
          throw failure
        }
        return false
      },
    }),
  ).toThrow(failure)

  router.clearCache()
  expect(firstSignal?.aborted).toBe(true)
  expect(secondSignal?.aborted).toBe(true)

  firstGate.resolve('first')
  secondGate.resolve('second')
  await Promise.all([firstPreload, secondPreload])
})

test('filtered clearCache preserves a parent flight owned by another preload', async () => {
  const parentGate = createControlledPromise<string>()
  const parentError = new Error('shared parent failed')
  const onError = vi.fn()
  const parentLoader = vi.fn(() => parentGate)
  const secondLoader = vi.fn(() => 'second')
  const thirdLoader = vi.fn(() => 'third')
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: parentLoader,
    onError,
  })
  const firstRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/first',
  })
  const secondRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/second',
    loader: secondLoader,
  })
  const thirdRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/third',
    loader: thirdLoader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      homeRoute,
      parentRoute.addChildren([firstRoute, secondRoute, thirdRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const firstPreload = router.preloadRoute({ to: '/parent/first' })
  await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledOnce())
  const secondPreload = router.preloadRoute({ to: '/parent/second' })
  await vi.waitFor(() => expect(secondLoader).toHaveBeenCalledOnce())

  router.clearCache({
    filter: (match) => match.routeId === firstRoute.id,
  })
  const thirdPreload = router.preloadRoute({ to: '/parent/third' })
  await vi.waitFor(() => expect(thirdLoader).toHaveBeenCalledOnce())

  expect(parentLoader).toHaveBeenCalledOnce()

  parentGate.reject(parentError)
  await Promise.all([firstPreload, secondPreload, thirdPreload])
  expect(onError).toHaveBeenCalledExactlyOnceWith(parentError)
})

test('independent concurrent preloads both populate the cache', async () => {
  const firstGate = createControlledPromise<string>()
  const secondGate = createControlledPromise<string>()
  const firstLoader = vi.fn(() => firstGate)
  const secondLoader = vi.fn(() => secondGate)
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const firstRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/first',
    preloadStaleTime: Infinity,
    loader: firstLoader,
  })
  const secondRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/second',
    preloadStaleTime: Infinity,
    loader: secondLoader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, firstRoute, secondRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const firstPreload = router.preloadRoute({ to: '/first' })
  const secondPreload = router.preloadRoute({ to: '/second' })
  await vi.waitFor(() => {
    expect(firstLoader).toHaveBeenCalledOnce()
    expect(secondLoader).toHaveBeenCalledOnce()
  })

  firstGate.resolve('first data')
  await firstPreload
  secondGate.resolve('second data')
  await secondPreload

  await router.navigate({ to: '/first' })
  await router.navigate({ to: '/second' })
  expect(firstLoader).toHaveBeenCalledOnce()
  expect(secondLoader).toHaveBeenCalledOnce()
})

test.each([
  ['unfiltered', undefined, true],
  ['filtered affected', 'target', true],
  ['filtered unaffected', 'home', false],
] as const)(
  '%s invalidation handles an active preload according to its filter scope',
  async (_mode, selected, shouldRetire) => {
    const oldLoaderGate = createControlledPromise<string>()
    const signals: Array<AbortSignal> = []
    const loader = vi.fn(
      ({ abortController }: { abortController: AbortController }) => {
        signals.push(abortController.signal)
        return loader.mock.calls.length === 1
          ? oldLoaderGate
          : 'new-generation'
      },
    )
    const rootRoute = new BaseRootRoute({})
    const homeRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      preloadStaleTime: Infinity,
      staleTime: Infinity,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([homeRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/target' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce())

    await (selected
      ? router.invalidate({
          filter: (match) =>
            match.routeId ===
            (selected === 'target' ? targetRoute.id : homeRoute.id),
        })
      : router.invalidate())
    const retired = signals[0]!.aborted
    oldLoaderGate.resolve('old-generation')
    await preload
    await router.navigate({ to: '/target' })

    expect(retired).toBe(shouldRetire)
    expect(loader).toHaveBeenCalledTimes(shouldRetire ? 2 : 1)
    expect(router.state.matches.at(-1)).toMatchObject({
      invalid: false,
      loaderData: shouldRetire ? 'new-generation' : 'old-generation',
    })
  },
)

// Preload lanes are not cancelled by unrelated navigations: an in-flight
// async beforeLoad runs to completion, its loader still executes and seeds
// the cache, and a later navigation to the target reuses that work.
test('an unrelated navigation does not cancel an in-flight preload beforeLoad', async () => {
  const beforeLoadGate = createControlledPromise<{ token: string }>()
  const beforeLoad = vi.fn(() => beforeLoadGate)
  const loader = vi.fn(() => 'target data')
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const otherRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    preloadStaleTime: Infinity,
    staleTime: Infinity,
    beforeLoad,
    loader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, otherRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const preload = router.preloadRoute({ to: '/target' })
  await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(1))

  // Unrelated navigation commits while the preload's beforeLoad is pending.
  await router.navigate({ to: '/other' })
  expect(router.state.location.pathname).toBe('/other')

  beforeLoadGate.resolve({ token: 'ctx' })
  await preload
  // The preload completed its work despite the navigation.
  expect(loader).toHaveBeenCalledTimes(1)

  // Navigating to the target consumes the seeded cache without a new load.
  await router.navigate({ to: '/target' })
  expect(router.state.location.pathname).toBe('/target')
  expect(
    router.state.matches.find((match) => match.routeId === targetRoute.id)
      ?.loaderData,
  ).toBe('target data')
  expect(loader).toHaveBeenCalledTimes(1)
})
