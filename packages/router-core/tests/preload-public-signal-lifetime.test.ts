import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

function deferred<T>() {
  let resolve!: (value?: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => {
    resolve = (value) => done(value as T)
  })
  return { promise, resolve }
}

// Public contract: the AbortSignal supplied to loader code belongs to the
// accepted data generation. Adopting preloaded data keeps it alive; accepting
// replacement data aborts it; unloading aborts the replacement generation.
test('an adopted loader signal lives until public replacement and unload', async () => {
  const replacementGate = deferred<{ generation: number }>()
  const signals: Array<AbortSignal> = []
  const loader = vi.fn(
    ({ abortController }: { abortController: AbortController }) => {
      signals.push(abortController.signal)
      const generation = signals.length
      return generation === 1 ? { generation } : replacementGate.promise
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
  const adoptedSignal = signals[0]
  expect(adoptedSignal?.aborted).toBe(false)

  await router.navigate({ to: '/reports' })
  expect(loader).toHaveBeenCalledTimes(1)
  expect(router.state.matches.at(-1)?.loaderData).toEqual({ generation: 1 })
  expect(adoptedSignal?.aborted).toBe(false)

  const replacement = router.invalidate({ forcePending: true })
  await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
  const replacementSignal = signals[1]

  // Until replacement data is accepted, the currently rendered data still
  // owns the adopted signal.
  expect(adoptedSignal?.aborted).toBe(false)
  expect(replacementSignal?.aborted).toBe(false)

  replacementGate.resolve({ generation: 2 })
  await replacement
  expect(router.state.matches.at(-1)?.loaderData).toEqual({ generation: 2 })
  expect(adoptedSignal?.aborted).toBe(true)
  expect(replacementSignal?.aborted).toBe(false)

  await router.navigate({ to: '/' })
  expect(replacementSignal?.aborted).toBe(true)
})

test('a superseded preload releases its borrowed loader signal lease', async () => {
  const signals: Array<AbortSignal> = []
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
      signals.push(abortController.signal)
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
  const signal = signals[0]
  expect(signal?.aborted).toBe(false)

  await router.preloadRoute({ to: '/parent/child' })
  await navigation

  expect(router.state.location.pathname).toBe('/')
  expect(signal?.aborted).toBe(true)
})
