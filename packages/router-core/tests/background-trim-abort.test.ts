import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

test('background error trimming aborts a discarded descendant loader signal', async () => {
  let parentLoads = 0
  let childLoads = 0
  let retainedParentSignal: AbortSignal | undefined
  let discardedChildSignal: AbortSignal | undefined
  const parentError = new Error('parent background reload failed')

  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: ({ abortController }) => {
      if (++parentLoads > 1) {
        retainedParentSignal = abortController.signal
        throw parentError
      }
      return 'initial parent data'
    },
    errorComponent: () => null,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: ({ abortController }) => {
      if (++childLoads > 1) {
        discardedChildSignal = abortController.signal
      }
      return 'child data'
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
  })

  await router.load()
  await router.invalidate()

  await expect
    .poll(() => router.state.matches.at(-1)?.status)
    .toBe('error')

  expect(router.state.matches.map((match) => match.routeId)).toEqual([
    rootRoute.id,
    parentRoute.id,
  ])
  expect(retainedParentSignal).toBeDefined()
  expect(discardedChildSignal).toBeDefined()
  expect(discardedChildSignal).not.toBe(retainedParentSignal)
  expect(router.state.matches.at(-1)?.abortController.signal).toBe(
    retainedParentSignal,
  )
  expect(retainedParentSignal?.aborted).toBe(false)
  expect(discardedChildSignal?.aborted).toBe(true)
})

test('foreground supersession aborts every loader in a background batch', async () => {
  let parentLoads = 0
  let childLoads = 0
  const backgroundSignals: Array<AbortSignal> = []

  const waitForAbort = (signal: AbortSignal) =>
    new Promise<never>((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        },
        { once: true },
      )
    })

  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loader: ({ abortController }) => {
      if (++parentLoads > 1) {
        backgroundSignals.push(abortController.signal)
        return waitForAbort(abortController.signal)
      }
      return 'initial parent data'
    },
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loader: ({ abortController }) => {
      if (++childLoads > 1) {
        backgroundSignals.push(abortController.signal)
        return waitForAbort(abortController.signal)
      }
      return 'initial child data'
    },
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
  })

  await router.load()
  const revalidation = router.invalidate()
  await vi.waitFor(() => expect(backgroundSignals).toHaveLength(2))

  await router.navigate({ to: '/other' })
  await revalidation

  expect(backgroundSignals[0]).not.toBe(backgroundSignals[1])
  expect(backgroundSignals.every((signal) => signal.aborted)).toBe(true)
  expect(router.state.matches.at(-1)?.routeId).toBe(otherRoute.id)
})
