import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

// https://github.com/TanStack/router/issues/4476
// A navigation that adopts an in-flight preload's loader run must reuse that
// run: it must NOT abort the preload's loader signal, and it must NOT re-run
// the loader. Aborting mid-flight is what surfaced as a CancelledError from a
// signal-aware queryFn (e.g. queryClient.fetchQuery) when the user clicked
// through during an intent preload.
//
// This shape is not covered by preload-adoption.test.ts (serial-phase decline
// and sibling-preload adoption); the distinguishing assertion here is that the
// adopted loader's captured signal is never aborted.
describe('issue #4476 - navigation adopting an in-flight preload does not abort the loader', () => {
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
    // (The private preload lane stays out of cachedMatches until it succeeds,
    // so the loader-call gate is how we observe the in-flight loader here.)
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
