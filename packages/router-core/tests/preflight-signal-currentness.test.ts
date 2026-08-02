import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, redirect } from '../src'
import { createTestRouter } from './routerTestUtils'

describe('public preflight currentness', () => {
  test.each(['onBeforeNavigate', 'onBeforeLoad'] as const)(
    'a synchronous navigation from %s supersedes the emitting generation',
    async (eventType) => {
      const firstBeforeLoad = vi.fn()
      const firstLoader = vi.fn(() => 'first')
      const secondBeforeLoad = vi.fn()
      const secondLoader = vi.fn(() => 'second')
      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const firstRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/first',
        beforeLoad: firstBeforeLoad,
        loader: firstLoader,
      })
      const secondRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/second',
        beforeLoad: secondBeforeLoad,
        loader: secondLoader,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([indexRoute, firstRoute, secondRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await router.load()
      let replacement: Promise<void> | undefined
      let reenter = true
      const unsubscribe = router.subscribe(eventType, (event) => {
        if (reenter && event.toLocation.pathname === '/first') {
          reenter = false
          replacement = router.navigate({ to: '/second' })
        }
      })

      await router.navigate({ to: '/first' })
      await replacement
      unsubscribe()

      expect(router.state.location.pathname).toBe('/second')
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: secondRoute.id,
        status: 'success',
        loaderData: 'second',
      })
      expect(firstBeforeLoad).not.toHaveBeenCalled()
      expect(firstLoader).not.toHaveBeenCalled()
      expect(secondBeforeLoad).toHaveBeenCalledOnce()
      expect(secondLoader).toHaveBeenCalledOnce()
    },
  )

  test('a route-context redirect retires its matching generation before following the redirect', async () => {
    let sourceSignal: AbortSignal | undefined
    const sourceBeforeLoad = vi.fn()
    const sourceLoader = vi.fn()
    const targetLoader = vi.fn(() => 'target')
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      context: ({ abortController }) => {
        sourceSignal = abortController.signal
        throw redirect({ to: '/target' })
      },
      beforeLoad: sourceBeforeLoad,
      loader: sourceLoader,
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loader: targetLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, sourceRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.navigate({ to: '/source' })

    expect(router.state.location.pathname).toBe('/target')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
      loaderData: 'target',
    })
    expect(sourceSignal?.aborted).toBe(true)
    expect(sourceBeforeLoad).not.toHaveBeenCalled()
    expect(sourceLoader).not.toHaveBeenCalled()
    expect(targetLoader).toHaveBeenCalledOnce()
  })

  test('a navigation started by a failing loaderDeps callback wins over the stale match error', async () => {
    const matchError = new Error('loaderDeps failed')
    const brokenLoader = vi.fn()
    const targetLoader = vi.fn(() => 'target')
    let replacement: Promise<void> | undefined
    let reenter = true
    let navigateToTarget!: () => Promise<void>
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const brokenRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/broken',
      loaderDeps: (): Record<string, never> => {
        if (reenter) {
          reenter = false
          replacement = navigateToTarget()
        }
        throw matchError
      },
      loader: brokenLoader,
      errorComponent: () => null,
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loader: targetLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, brokenRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    navigateToTarget = () => router.navigate({ to: '/target' })

    await router.load()
    await router.navigate({ to: '/broken' })
    await replacement

    expect(router.state.location.pathname).toBe('/target')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
      loaderData: 'target',
    })
    expect(brokenLoader).not.toHaveBeenCalled()
    expect(targetLoader).toHaveBeenCalledOnce()
  })

  test('rapid preload, same-location load, and replacement navigation preserve only the newest navigation', async () => {
    const firstBeforeLoad = vi.fn()
    const firstLoader = vi.fn(() => 'first')
    const preloadLoader = vi.fn(() => 'preloaded')
    const finalLoader = vi.fn(() => 'final')
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const firstRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/first',
      beforeLoad: firstBeforeLoad,
      loader: firstLoader,
    })
    const preloadRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/preload',
      loader: preloadLoader,
    })
    const finalRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/final',
      loader: finalLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        firstRoute,
        preloadRoute,
        finalRoute,
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    let preload: Promise<unknown> | undefined
    let sameLocationLoad: Promise<void> | undefined
    let replacement: Promise<void> | undefined
    let reenter = true
    const unsubscribe = router.subscribe('onBeforeNavigate', (event) => {
      if (reenter && event.toLocation.pathname === '/first') {
        reenter = false
        preload = router.preloadRoute({ to: '/preload' })
        sameLocationLoad = router.load()
        replacement = router.navigate({ to: '/final' })
      }
    })

    await router.navigate({ to: '/first' })
    await Promise.all([preload, sameLocationLoad, replacement])
    unsubscribe()

    expect(router.state.location.pathname).toBe('/final')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: finalRoute.id,
      status: 'success',
      loaderData: 'final',
    })
    expect(firstBeforeLoad).not.toHaveBeenCalled()
    expect(firstLoader).not.toHaveBeenCalled()
    expect(preloadLoader).toHaveBeenCalledOnce()
    expect(finalLoader).toHaveBeenCalledOnce()
  })

  test('a navigation started by invalidation preflight supersedes the invalidated reload', async () => {
    const pageLoader = vi.fn(() => 'page')
    const otherLoader = vi.fn(() => 'other')
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader: pageLoader,
    })
    const otherRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
      loader: otherLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute, otherRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    let replacement: Promise<void> | undefined
    let reenter = true
    const unsubscribe = router.subscribe('onBeforeNavigate', (event) => {
      if (reenter && event.toLocation.pathname === '/page') {
        reenter = false
        replacement = router.navigate({ to: '/other' })
      }
    })

    await router.invalidate()
    await replacement
    unsubscribe()

    expect(router.state.location.pathname).toBe('/other')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: otherRoute.id,
      status: 'success',
      loaderData: 'other',
    })
    expect(pageLoader).toHaveBeenCalledOnce()
    expect(otherLoader).toHaveBeenCalledOnce()
  })
})
