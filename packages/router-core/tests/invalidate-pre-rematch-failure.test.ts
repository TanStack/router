import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Fallible rematch work runs before loadClientRouter can raise isLoading. An
 * invalidation must keep the old active lane terminal until rematching
 * succeeds, so a fatal pre-rematch failure cannot strand unowned pending UI.
 */
test('a fatal pre-rematch failure cannot leave active pending matches while isLoading is false', async () => {
  const unhandledRejection = vi.fn()
  process.on('unhandledRejection', unhandledRejection)

  try {
    const boom = new Error('loaderDeps failed during invalidation rematch')
    let failLoaderDeps = false
    let activeSignal: AbortSignal | undefined

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
        activeSignal = abortController.signal
        return 'target data'
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/target'] }),
    })

    await router.load()
    expect(router.stores.isLoading.get()).toBe(false)
    expect(router.state.matches.at(-1)?.status).toBe('success')

    failLoaderDeps = true
    await router.invalidate({ forcePending: true })

    // loadClientRouter keeps fatal machinery failures observable even though
    // its public load/invalidate promise resolves.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(unhandledRejection).toHaveBeenCalledWith(boom, expect.anything())

    expect(router.stores.isLoading.get()).toBe(false)
    expect(
      router.state.matches.filter((match) => match.status === 'pending'),
    ).toEqual([])
    // The failed replacement never acquired a lane, so it must not cancel
    // resources owned by the still-active successful loader generation.
    expect(activeSignal?.aborted).toBe(false)
  } finally {
    process.off('unhandledRejection', unhandledRejection)
  }
})
