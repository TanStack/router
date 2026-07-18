import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

// Public contract: the AbortSignal supplied to loader code belongs to the
// accepted data generation. Adopting preloaded data keeps it alive; accepting
// replacement data aborts it; unloading aborts the replacement generation.
test('an adopted loader signal lives until public replacement and unload', async () => {
  const replacementGate = createControlledPromise<{ generation: number }>()
  let generation = 0
  let adoptedSignal: AbortSignal | undefined
  let replacementSignal: AbortSignal | undefined
  const loader = vi.fn(
    ({ abortController }: { abortController: AbortController }) => {
      generation++
      if (generation === 1) {
        adoptedSignal = abortController.signal
        return { generation }
      }

      replacementSignal = abortController.signal
      return replacementGate
    },
  )

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
    loader: {
      staleReloadMode: 'blocking',
      handler: loader,
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, reportsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.preloadRoute({ to: '/reports' })
  expect(adoptedSignal?.aborted).toBe(false)

  await router.navigate({ to: '/reports' })
  expect(loader).toHaveBeenCalledTimes(1)
  expect(
    router.state.matches.find((match) => match.routeId === reportsRoute.id)
      ?.loaderData,
  ).toEqual({ generation: 1 })
  expect(adoptedSignal?.aborted).toBe(false)

  const replacement = router.invalidate({ forcePending: true })
  await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
  expect(replacementGate.status).toBe('pending')

  // Until replacement data is accepted, the currently rendered data still
  // owns the adopted signal.
  expect(adoptedSignal?.aborted).toBe(false)
  expect(replacementSignal?.aborted).toBe(false)

  replacementGate.resolve({ generation: 2 })
  await replacement
  expect(
    router.state.matches.find((match) => match.routeId === reportsRoute.id)
      ?.loaderData,
  ).toEqual({ generation: 2 })
  expect(adoptedSignal?.aborted).toBe(true)
  expect(replacementSignal?.aborted).toBe(false)

  await router.navigate({ to: '/' })
  expect(replacementSignal?.aborted).toBe(true)
})

test('a superseded preload releases its borrowed loader signal lease', async () => {
  let parentSignal: AbortSignal | undefined
  let navigation!: Promise<void>

  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: ({ abortController }) => {
      parentSignal = abortController.signal
      return 'parent data'
    },
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    beforeLoad: ({ navigate, preload }) => {
      if (preload) {
        navigation = navigate({ to: '/' })
        throw navigation
      }
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      homeRoute,
      parentRoute.addChildren([childRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/parent'] }),
  })

  await router.load()
  expect(parentSignal?.aborted).toBe(false)

  await router.preloadRoute({ to: '/parent/child' })
  await navigation

  expect(router.state.location.pathname).toBe('/')
  expect(parentSignal?.aborted).toBe(true)
})

test('HMR aborts a preload waiting in asset projection', async () => {
  const headStarted = createControlledPromise<void>()
  const headGate = createControlledPromise<void>()
  let signal: AbortSignal | undefined

  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    loader: ({ abortController }) => {
      signal = abortController.signal
      return 'target data'
    },
    head: async () => {
      headStarted.resolve()
      await headGate
      return { meta: [{ title: 'obsolete' }] }
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const preload = router.preloadRoute({ to: '/target' })
  await headStarted
  expect(signal?.aborted).toBe(false)

  expect(router._refreshRoute).toBeDefined()
  await router._refreshRoute!(targetRoute.id)
  await preload

  expect(signal?.aborted).toBe(true)
  expect(headGate.status).toBe('pending')
  expect(
    router.stores.cachedMatches
      .get()
      .some((match) => match.routeId === targetRoute.id),
  ).toBe(false)
})

test('HMR aborts a preload waiting for its route chunk', async () => {
  const chunkStarted = createControlledPromise<void>()
  const chunkGate = createControlledPromise<void>()
  let signal: AbortSignal | undefined
  const RouteComponent = Object.assign(() => null, {
    preload: () => {
      chunkStarted.resolve()
      return chunkGate
    },
  })

  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    component: RouteComponent,
    loader: ({ abortController }) => {
      signal = abortController.signal
      return 'target data'
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const preload = router.preloadRoute({ to: '/target' })
  await chunkStarted
  expect(signal?.aborted).toBe(false)

  expect(router._refreshRoute).toBeDefined()
  await router._refreshRoute!(targetRoute.id)
  await preload

  expect(signal?.aborted).toBe(true)
  expect(chunkGate.status).toBe('pending')
})

test('HMR does not release an inherited flight before preload execution', async () => {
  let parentSignal: AbortSignal | undefined

  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: ({ abortController }) => {
      parentSignal = abortController.signal
      return 'parent data'
    },
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      homeRoute,
      parentRoute.addChildren([childRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/parent'] }),
  })

  await router.load()
  expect(parentSignal?.aborted).toBe(false)

  const preload = router.preloadRoute({ to: '/parent/child' })
  expect(router._refreshRoute).toBeDefined()
  await Promise.all([router._refreshRoute!(childRoute.id), preload])

  expect(parentSignal?.aborted).toBe(false)
  await router.navigate({ to: '/' })
  expect(parentSignal?.aborted).toBe(true)
})

test('a superseded claim does not retain the preload controller', async () => {
  const loaderStarted = createControlledPromise<void>()
  const loaderGate = createControlledPromise<string>()
  let beforeLoadSignal: AbortSignal | undefined

  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    beforeLoad: ({ abortController }) => {
      beforeLoadSignal = abortController.signal
    },
    loader: () => {
      loaderStarted.resolve()
      return loaderGate
    },
  })
  const otherRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, targetRoute, otherRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const preload = router.preloadRoute({ to: '/target' })
  await loaderStarted
  const navigation = router.navigate({ to: '/target' })
  const superseding = preload.then(() => router.navigate({ to: '/other' }))

  loaderGate.resolve('target data')
  await Promise.all([navigation, superseding])

  expect(router.state.location.pathname).toBe('/other')
  expect(beforeLoadSignal?.aborted).toBe(true)
})

test('fatal adopted-lane cleanup aborts the transferred controller', async () => {
  const loaderStarted = createControlledPromise<void>()
  const loaderGate = createControlledPromise<string>()
  let beforeLoadSignal: AbortSignal | undefined

  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    beforeLoad: ({ abortController }) => {
      beforeLoadSignal = abortController.signal
    },
    loader: () => {
      loaderStarted.resolve()
      return loaderGate
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  router.startTransition = () => Promise.reject(new Error('render failed'))

  const preload = router.preloadRoute({ to: '/target' })
  await loaderStarted
  const navigation = router.navigate({ to: '/target' })

  loaderGate.resolve('target data')
  await Promise.all([preload, navigation])

  expect(beforeLoadSignal?.aborted).toBe(true)
})
