import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
  redirect,
} from '../src'
import { createTestRouter } from './routerTestUtils'

test('a flight reserved across beforeLoad successors is retired when navigation leaves its route', async () => {
  const loading = createControlledPromise<void>()
  const data = createControlledPromise<string>()
  const entered = [
    createControlledPromise<void>(),
    createControlledPromise<void>(),
  ]
  const gates = [
    createControlledPromise<void>(),
    createControlledPromise<void>(),
  ]
  let signal: AbortSignal | undefined
  const root = new BaseRootRoute({})
  const home = new BaseRoute({ getParentRoute: () => root, path: '/' })
  let retainedSignal: AbortSignal | undefined
  const retainedLoader = vi.fn(
    ({ abortController }: { abortController: AbortController }) => {
      retainedSignal = abortController.signal
      return 'retained data'
    },
  )
  const retained = new BaseRoute({
    getParentRoute: () => root,
    path: '/retained',
    preloadStaleTime: Infinity,
    preloadGcTime: Infinity,
    loader: retainedLoader,
  })
  const target = new BaseRoute({
    getParentRoute: () => root,
    path: '/target',
    validateSearch: (search: Record<string, unknown>) => ({
      step: Number(search.step ?? 0),
    }),
    beforeLoad: ({ search }) => {
      if (search.step) {
        entered[search.step - 1]!.resolve()
        return gates[search.step - 1]
      }
      return undefined
    },
    loader: ({ abortController }) => {
      signal = abortController.signal
      loading.resolve()
      return data
    },
  })
  const router = createTestRouter({
    routeTree: root.addChildren([home, target, retained]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  const first = router.navigate({ to: '/target', search: { step: 0 } })
  await loading
  const second = router.navigate({ to: '/target', search: { step: 1 } })
  await entered[0]
  expect(signal?.aborted).toBe(false)
  await router.preloadRoute({ to: '/retained' })
  expect(signal?.aborted).toBe(false)
  const third = router.navigate({ to: '/target', search: { step: 2 } })
  await entered[1]
  expect(signal?.aborted).toBe(false)

  await router.navigate({ to: '/' })

  expect(signal?.aborted).toBe(true)
  expect(router.state.location.pathname).toBe('/')
  for (const gate of gates) {
    gate.resolve()
  }
  data.resolve('obsolete data')
  await Promise.all([first, second, third])
  expect(retainedSignal?.aborted).toBe(false)
  await router.navigate({ to: '/retained' })
  expect(retainedLoader).toHaveBeenCalledOnce()
  expect(router.state.matches.at(-1)?.loaderData).toBe('retained data')
})

test('sweep abort listeners can create another reservation for a later sweep', async () => {
  const dataA = createControlledPromise<string>()
  const dataB = createControlledPromise<string>()
  const startedA = createControlledPromise<void>()
  const enteredA = createControlledPromise<void>()
  const enteredB = createControlledPromise<void>()
  const beforeA = createControlledPromise<void>()
  const beforeB = createControlledPromise<void>()
  let signalA: AbortSignal | undefined
  let signalB: AbortSignal | undefined
  const root = new BaseRootRoute({})
  const home = new BaseRoute({ getParentRoute: () => root, path: '/' })
  const a = new BaseRoute({
    getParentRoute: () => root,
    path: '/a',
    validateSearch: (search: Record<string, unknown>) => ({
      blocked: !!search.blocked,
    }),
    beforeLoad: ({ search }) => {
      if (search.blocked) {
        enteredA.resolve()
        return beforeA
      }
      return undefined
    },
    loader: ({ abortController }) => {
      signalA = abortController.signal
      startedA.resolve()
      return dataA
    },
  })
  const b = new BaseRoute({
    getParentRoute: () => root,
    path: '/b',
    validateSearch: (search: Record<string, unknown>) => ({
      blocked: !!search.blocked,
    }),
    beforeLoad: ({ search }) => {
      if (search.blocked) {
        enteredB.resolve()
        return beforeB
      }
      return undefined
    },
    loader: ({ abortController }) => {
      signalB = abortController.signal
      return dataB
    },
  })
  const router = createTestRouter({
    routeTree: root.addChildren([home, a, b]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  const first = router.navigate({ to: '/a', search: { blocked: false } })
  await startedA
  const second = router.navigate({ to: '/a', search: { blocked: true } })
  await enteredA
  let reentrant: Promise<void> | undefined
  signalA!.addEventListener('abort', () => {
    reentrant = router.navigate({ to: '/b', search: { blocked: true } })
  })
  const third = router.navigate({ to: '/b', search: { blocked: false } })
  await enteredB
  expect(signalA?.aborted).toBe(true)
  expect(signalB?.aborted).toBe(false)
  const aborted = vi.fn()
  signalB!.addEventListener('abort', aborted)
  await router.navigate({ to: '/' })
  expect(signalB?.aborted).toBe(true)
  expect(aborted).toHaveBeenCalledOnce()
  beforeA.resolve()
  beforeB.resolve()
  dataA.resolve('old a')
  dataB.resolve('old b')
  await Promise.all([first, second, third, reentrant])
  expect(router.state.location.pathname).toBe('/')
})

test.each(['error', 'notFound', 'root notFound', 'redirect'] as const)(
  'a beforeLoad %s retires reserved work',
  async (kind) => {
    const started = createControlledPromise<void>()
    const entered = createControlledPromise<void>()
    const data = createControlledPromise<string>()
    const before = createControlledPromise<void>()
    let signal: AbortSignal | undefined
    const root = new BaseRootRoute({ notFoundComponent: () => null })
    const home = new BaseRoute({ getParentRoute: () => root, path: '/' })
    const loader = vi.fn(
      ({ abortController }: { abortController: AbortController }) => {
        signal = abortController.signal
        started.resolve()
        return data
      },
    )
    const target = new BaseRoute({
      getParentRoute: () => root,
      path: '/target',
      notFoundComponent: () => null,
      validateSearch: (search: Record<string, unknown>) => ({
        blocked: !!search.blocked,
      }),
      beforeLoad: async ({ search }) => {
        if (search.blocked) {
          entered.resolve()
          await before
          if (kind === 'redirect') {
            throw redirect({ to: '/' })
          }
          if (kind !== 'error') {
            throw notFound({
              routeId: kind === 'root notFound' ? root.id : '/target',
            })
          }
          throw new Error('beforeLoad failed')
        }
      },
      loader,
    })
    const router = createTestRouter({
      routeTree: root.addChildren([home, target]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()
    const first = router.navigate({ to: '/target', search: { blocked: false } })
    await started
    const second = router.navigate({ to: '/target', search: { blocked: true } })
    await entered
    expect(signal?.aborted).toBe(false)
    before.resolve()
    await second
    expect(signal?.aborted).toBe(true)
    expect(loader).toHaveBeenCalledOnce()
    expect(router.state.location.pathname).toBe(
      kind === 'redirect' ? '/' : '/target',
    )
    data.resolve('obsolete data')
    await first
  },
)

test.each([false, true])(
  'a preload released during beforeLoad can be adopted=%s without stranding its signal',
  async (adopt) => {
    const started = createControlledPromise<void>()
    const loaderGate = createControlledPromise<string>()
    const redirectGate = createControlledPromise<void>()
    const beforeLoadStarted = createControlledPromise<void>()
    const beforeLoadGate = createControlledPromise<void>()
    let signal: AbortSignal | undefined
    const loader = vi.fn(
      ({ abortController }: { abortController: AbortController }) => {
        if (loader.mock.calls.length === 1) {
          return 'initial data'
        }
        signal = abortController.signal
        started.resolve()
        return loaderGate
      },
    )
    const root = new BaseRootRoute({})
    const home = new BaseRoute({ getParentRoute: () => root, path: '/' })
    const target = new BaseRoute({
      getParentRoute: () => root,
      path: '/target',
      validateSearch: (search: Record<string, unknown>) => ({
        step: Number(search.step ?? 0),
      }),
      beforeLoad: ({ preload, search }) => {
        if (!preload && search.step === 1) {
          beforeLoadStarted.resolve()
          return beforeLoadGate
        }
        return undefined
      },
      shouldReload: ({ preload }) => preload || adopt,
      loader: { handler: loader, staleReloadMode: 'blocking' },
    })
    const redirecting = new BaseRoute({
      getParentRoute: () => target,
      path: '/redirect',
      loader: async () => {
        await redirectGate
        throw redirect({ to: '/' })
      },
    })
    const router = createTestRouter({
      routeTree: root.addChildren([home, target.addChildren([redirecting])]),
      history: createMemoryHistory({ initialEntries: ['/target'] }),
    })
    await router.load()
    const preload = router.preloadRoute({
      to: '/target/redirect',
      search: { step: 0 },
    })
    await started
    const navigation = router.navigate({ to: '/target', search: { step: 1 } })
    await beforeLoadStarted
    redirectGate.resolve()
    await preload
    expect(signal?.aborted).toBe(false)

    beforeLoadGate.resolve()
    if (adopt) {
      loaderGate.resolve('shared data')
    }
    await navigation
    expect(loader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)?.loaderData).toBe(
      adopt ? 'shared data' : 'initial data',
    )
    expect(signal?.aborted).toBe(!adopt)
    await router.navigate({ to: '/' })
    expect(signal?.aborted).toBe(true)
    loaderGate.resolve('unused data')
  },
)

test('invalidation retires a zero-owner reservation before a blocked successor completes', async () => {
  const started = createControlledPromise<void>()
  const data = createControlledPromise<string>()
  const entered = createControlledPromise<void>()
  const before = createControlledPromise<void>()
  let signal: AbortSignal | undefined
  const root = new BaseRootRoute({})
  const home = new BaseRoute({ getParentRoute: () => root, path: '/' })
  const target = new BaseRoute({
    getParentRoute: () => root,
    path: '/target',
    validateSearch: (search: Record<string, unknown>) => ({
      blocked: !!search.blocked,
    }),
    beforeLoad: ({ search }) => {
      if (search.blocked) {
        entered.resolve()
        return before
      }
      return undefined
    },
    loader: ({ abortController }) => {
      signal = abortController.signal
      started.resolve()
      return data
    },
  })
  const router = createTestRouter({
    routeTree: root.addChildren([home, target]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  const first = router.navigate({ to: '/target', search: { blocked: false } })
  await started
  const second = router.navigate({ to: '/target', search: { blocked: true } })
  await entered
  expect(signal?.aborted).toBe(false)
  const aborted = vi.fn()
  signal!.addEventListener('abort', aborted)
  const invalidation = router.invalidate({
    filter: (match) => match.routeId === target.id,
  })
  await router.navigate({ to: '/' })
  before.resolve()
  data.resolve('obsolete data')
  await Promise.all([first, second, invalidation])
  expect(signal?.aborted).toBe(true)
  expect(aborted).toHaveBeenCalledOnce()
  expect(router.state.location.pathname).toBe('/')
})
