import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * A preload lane may borrow active/cached matches, but borrowed snapshots do
 * not become owned merely because their original owner disappears while the
 * speculative descendant or asset work is in flight.
 */
describe('preload cache ownership', () => {
  test('a descendant preload does not cache data derived from a superseded pending-published parent', async () => {
    const currentPageGate = createControlledPromise<void>()
    const preloadedPageGate = createControlledPromise<void>()
    // This varies only with the requested URL, not with preload mode. For a
    // given target it returns exactly the same context to preload/navigation.
    const parentBeforeLoad = vi.fn(({ location }) => ({
      workspace: location.pathname,
    }))
    let preloadedLoaderSignal: AbortSignal | undefined
    const currentPageLoader = vi.fn(async ({ abortController }) => {
      abortController.signal.addEventListener(
        'abort',
        () => currentPageGate.resolve(),
        { once: true },
      )
      await currentPageGate
      return { page: 'current' }
    })
    const preloadedPageLoader = vi.fn(async ({ context, abortController }) => {
      preloadedLoaderSignal = abortController.signal
      const workspace = (context as { workspace: string }).workspace
      await preloadedPageGate
      return { workspace }
    })

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/workspace',
      beforeLoad: parentBeforeLoad,
    })
    const currentPageRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/current',
      pendingMs: 0,
      pendingComponent: () => null,
      loader: currentPageLoader,
    })
    const preloadedPageRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/reports',
      staleTime: Infinity,
      preloadStaleTime: Infinity,
      loader: preloadedPageLoader,
    })
    const otherRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([currentPageRoute, preloadedPageRoute]),
        otherRoute,
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const currentNavigation = router.navigate({ to: '/workspace/current' })
    await vi.waitFor(() => expect(currentPageLoader).toHaveBeenCalledTimes(1))

    // pendingMs publishes the render-ready lane before its leaf loader
    // settles. The parent has already completed and is borrowed as success.
    await vi.waitFor(() => {
      expect(router.stores.pendingIds.get()).toEqual([])
      expect(
        router.state.matches.find((match) => match.routeId === parentRoute.id)
          ?.status,
      ).toBe('success')
      expect(
        router.state.matches.find(
          (match) => match.routeId === currentPageRoute.id,
        )?.status,
      ).toBe('pending')
    })

    const reportsPreload = router.preloadRoute({
      to: '/workspace/reports',
    })
    await vi.waitFor(() => expect(preloadedPageLoader).toHaveBeenCalledTimes(1))

    // A fast navigation supersedes and removes the foreground owner. It also
    // clears pendingBuiltLocation before the speculative loader responds,
    // matching a user who hovers one link and immediately navigates elsewhere.
    await router.navigate({ to: '/other' })
    expect(router.state.location.pathname).toBe('/other')

    preloadedPageGate.resolve()
    await Promise.allSettled([currentNavigation, reportsPreload])

    // The reports data was derived from the borrowed /workspace/current
    // context. Once that owner was superseded, the speculative snapshot must
    // not become a reusable cache entry.
    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.routeId === preloadedPageRoute.id),
    ).toBe(false)
    expect(preloadedLoaderSignal?.aborted).toBe(true)

    await router.navigate({ to: '/workspace/reports' })

    expect(parentBeforeLoad).toHaveBeenCalledTimes(2)
    expect(preloadedPageLoader).toHaveBeenCalledTimes(2)
    expect(
      router.state.matches.find(
        (match) => match.routeId === preloadedPageRoute.id,
      )?.loaderData,
    ).toEqual({ workspace: '/workspace/reports' })
  })

  test('clearCache during async preload head projection does not resurrect a borrowed cached snapshot', async () => {
    const preloadHeadGate = createControlledPromise<{
      meta: Array<{ title: string }>
    }>()
    let loaderCalls = 0
    let headCalls = 0
    const reportsLoader = vi.fn(() => ({ revision: ++loaderCalls }))
    const reportsHead = vi.fn(() => {
      headCalls++
      return headCalls === 1
        ? { meta: [{ title: 'Reports' }] }
        : preloadHeadGate
    })

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const reportsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/reports',
      staleTime: Infinity,
      preloadStaleTime: Infinity,
      gcTime: 60_000,
      loader: reportsLoader,
      head: reportsHead,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, reportsRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.navigate({ to: '/reports' })
    await router.navigate({ to: '/' })

    expect(reportsLoader).toHaveBeenCalledTimes(1)
    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.routeId === reportsRoute.id),
    ).toBe(true)

    // This preload borrows the fresh cached loader result. Its async head
    // projection keeps the pass open while the user clears the cache.
    const preload = router.preloadRoute({ to: '/reports' })
    await vi.waitFor(() => expect(reportsHead).toHaveBeenCalledTimes(2))
    expect(reportsLoader).toHaveBeenCalledTimes(1)

    router.clearCache()
    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.routeId === reportsRoute.id),
    ).toBe(false)

    preloadHeadGate.resolve({ meta: [{ title: 'Preloaded reports' }] })
    await preload

    // Resolving unrelated asset work cannot turn a borrowed snapshot into
    // owned loader work and undo the public clearCache request.
    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.routeId === reportsRoute.id),
    ).toBe(false)

    await router.navigate({ to: '/reports' })
    expect(reportsLoader).toHaveBeenCalledTimes(2)
  })

  test('a borrowed loaderless parent replacement invalidates descendant preload data', async () => {
    const reportGate = createControlledPromise<void>()
    let reportCalls = 0
    const reportLoader = vi.fn(async ({ parentMatchPromise }) => {
      const parentMatch = (await parentMatchPromise) as {
        search: { workspace: string }
      }
      const workspace = parentMatch.search.workspace
      if (++reportCalls === 1) {
        await reportGate
      }
      return { workspace }
    })

    const rootRoute = new BaseRootRoute({})
    const workspaceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/workspace',
      validateSearch: (search: Record<string, unknown>) => ({
        workspace: String(search.workspace ?? ''),
      }),
    })
    const currentRoute = new BaseRoute({
      getParentRoute: () => workspaceRoute,
      path: '/current',
    })
    const reportRoute = new BaseRoute({
      getParentRoute: () => workspaceRoute,
      path: '/report',
      loader: reportLoader,
      preloadStaleTime: Infinity,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        workspaceRoute.addChildren([currentRoute, reportRoute]),
      ]),
      history: createMemoryHistory({
        initialEntries: ['/workspace/current?workspace=a'],
      }),
    })

    await router.load()
    const firstParent = router.state.matches.find(
      (match) => match.routeId === workspaceRoute.id,
    )!

    const preload = router.preloadRoute({
      to: '/workspace/report',
      search: { workspace: 'a' },
    } as any)
    await vi.waitFor(() => expect(reportLoader).toHaveBeenCalledTimes(1))

    await router.navigate({
      to: '/workspace/current',
      search: { workspace: 'b' },
    } as any)

    const replacementParent = router.state.matches.find(
      (match) => match.routeId === workspaceRoute.id,
    )!
    expect(replacementParent.id).toBe(firstParent.id)
    expect(replacementParent.abortController).not.toBe(
      firstParent.abortController,
    )

    reportGate.resolve()
    await preload

    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.routeId === reportRoute.id),
    ).toBe(false)

    await router.navigate({
      to: '/workspace/report',
      search: { workspace: 'b' },
    } as any)

    expect(reportLoader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)?.loaderData).toEqual({ workspace: 'b' })
  })
})
