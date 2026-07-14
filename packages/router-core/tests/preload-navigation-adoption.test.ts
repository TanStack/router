import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

// A navigation that adopts an in-flight preload's loader run must reuse that
// run: it must not abort the preload's loader signal or rerun the loader. This
// is generic router adoption coverage; issue #4476 is covered separately with
// the React Query observer-unmount sequence from its reproduction.
describe('navigation adopting an in-flight preload', () => {
  test('adopted preload loader runs once and its signal is not aborted', async () => {
    const loaderGate = createControlledPromise<string>()
    let capturedSignal: AbortSignal | undefined
    const loader = vi.fn(
      ({ abortController }: { abortController: AbortController }) => {
        capturedSignal = abortController.signal
        return loaderGate
      },
    )

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, fooRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    // Start the preload and wait until its loader is actually in flight.
    const preload = router.preloadRoute({ to: '/foo' } as any)
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
    expect(capturedSignal).toBeDefined()
    expect(capturedSignal?.aborted).toBe(false)

    // Navigate while the preload's loader is still pending — the navigation
    // must adopt the in-flight run rather than aborting and re-issuing it.
    const navigation = router.navigate({ to: '/foo' })

    // Resolve the shared loader and let both settle.
    loaderGate.resolve('adopted')
    await Promise.all([navigation, preload])

    // Loader ran exactly once; the adopted run's signal was never aborted.
    expect(loader).toHaveBeenCalledTimes(1)
    expect(capturedSignal?.aborted).toBe(false)

    // Navigation committed with the adopted loaderData.
    const committed = router.state.matches.find(
      (match) => match.routeId === fooRoute.id,
    )
    expect(committed?.status).toBe('success')
    expect(committed?.loaderData).toBe('adopted')

    // Adoption transfers loader-data lifetime ownership to the active match.
    // The shared request remains alive while rendered, then aborts on unload.
    await router.navigate({ to: '/' })
    expect(capturedSignal?.aborted).toBe(true)
  })
})
