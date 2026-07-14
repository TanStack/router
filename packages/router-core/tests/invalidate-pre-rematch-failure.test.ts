import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * A failed rematch must preserve resources owned by the accepted route and
 * leave the router usable for a later retry.
 */
test('a fatal pre-rematch failure preserves the active generation and permits retry', async () => {
  const boom = new Error('loaderDeps failed during invalidation rematch')
  let failLoaderDeps = false
  const loaderSignals: Array<AbortSignal> = []

  const rootRoute = new BaseRootRoute({})
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    loaderDeps: () => {
      if (failLoaderDeps) {
        throw boom
      }
      return {}
    },
    loader: ({ abortController }) => {
      loaderSignals.push(abortController.signal)
      return 'target data'
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/target'] }),
  })

  await router.load()
  const activeSignal = loaderSignals[0]
  expect(router.state.matches.at(-1)?.status).toBe('success')

  failLoaderDeps = true
  await router.invalidate({ forcePending: true })

  // The failed replacement never acquired a lane, so it must not cancel
  // resources owned by the still-active successful loader generation.
  expect(router.state.matches.at(-1)).toMatchObject({
    routeId: targetRoute.id,
    status: 'success',
    loaderData: 'target data',
  })
  expect(loaderSignals).toHaveLength(1)
  expect(activeSignal?.aborted).toBe(false)

  failLoaderDeps = false
  await router.invalidate()
  const retrySignal = loaderSignals[1]

  expect(router.state.matches.at(-1)).toMatchObject({
    routeId: targetRoute.id,
    status: 'success',
    loaderData: 'target data',
  })
  expect(loaderSignals).toHaveLength(2)
  expect(retrySignal).not.toBe(activeSignal)
  expect(activeSignal?.aborted).toBe(true)
  expect(retrySignal?.aborted).toBe(false)
})
