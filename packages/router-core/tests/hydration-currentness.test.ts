import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter } from './routerTestUtils'
import type { TsrSsrGlobal } from '../src/ssr/types'
import type { Manifest } from '../src/manifest'

const testManifest: Manifest = { routes: {} }

/**
 * Hydration asset work is another private lane generation. If a public
 * navigation commits while an old hydration head is pending, the hydration
 * continuation must not execute more old-lane hooks or mark its captured
 * location as resolved.
 */
describe('hydration asset currentness', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }

  beforeEach(() => {
    mockWindow = {}
    ;(global as any).window = mockWindow
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (global as any).window
  })

  test('does not resume an old hydration lane after a newer navigation commits', async () => {
    const oldHeadGate = createControlledPromise<{
      meta: Array<{ title: string }>
    }>()
    const oldHead = vi.fn(() => oldHeadGate)
    const oldScripts = vi.fn(() => [
      { children: 'window.oldHydrationLaneRan = true' },
    ])
    const newHead = vi.fn(() => ({
      meta: [{ title: 'New route' }],
    }))

    const rootRoute = new BaseRootRoute({})
    const oldRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/old',
      head: oldHead,
      scripts: oldScripts,
    })
    const newRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/new',
      head: newHead,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([oldRoute, newRoute]),
      history: createMemoryHistory({ initialEntries: ['/old'] }),
      isServer: false,
    })
    const oldMatches = router.matchRoutes(router.stores.location.get())

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: oldMatches[1]!.id,
        matches: oldMatches.map((match) => ({
          i: match.id,
          s: 'success' as const,
          ssr: true,
          u: Date.now(),
        })),
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    const hydration = hydrate(router)
    await vi.waitFor(() => expect(oldHead).toHaveBeenCalledTimes(1))

    // No framework history subscriber exists during the initial hydration
    // handoff, so navigate() exercises its public direct router.load() path.
    await router.navigate({ to: '/new' })

    expect(router.state.location.pathname).toBe('/new')
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      newRoute.id,
    ])
    const resolvedAfterNavigation = router.state.resolvedLocation?.pathname
    expect(resolvedAfterNavigation).not.toBe('/old')

    oldHeadGate.resolve({ meta: [{ title: 'Old route' }] })
    await hydration

    expect({
      oldScriptsCalls: oldScripts.mock.calls.length,
      newHeadCalls: newHead.mock.calls.length,
      location: router.state.location.pathname,
      routeIds: router.state.matches.map((match) => match.routeId),
      hydrationMovedResolvedLocationBackToOld:
        resolvedAfterNavigation !== '/old' &&
        router.state.resolvedLocation?.pathname === '/old',
    }).toEqual({
      oldScriptsCalls: 0,
      newHeadCalls: 1,
      location: '/new',
      routeIds: [rootRoute.id, newRoute.id],
      hydrationMovedResolvedLocationBackToOld: false,
    })
  })

  test('a synchronous context navigation prevents stale hydration assets from running', async () => {
    const oldHead = vi.fn(() => ({ meta: [{ title: 'Old route' }] }))
    const oldScripts = vi.fn(() => [
      { children: 'window.oldHydrationLaneRan = true' },
    ])
    const newHead = vi.fn(() => ({ meta: [{ title: 'New route' }] }))

    let router!: ReturnType<typeof createTestRouter>
    const rootRoute = new BaseRootRoute({})
    const oldRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/old',
      context: ({ matches }) => {
        if (matches.some((match) => match._.dehydrated)) {
          void router.navigate({ to: '/new' })
        }
        return { source: 'old' }
      },
      head: oldHead,
      scripts: oldScripts,
    })
    const newRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/new',
      head: newHead,
    })
    router = createTestRouter({
      routeTree: rootRoute.addChildren([oldRoute, newRoute]),
      history: createMemoryHistory({ initialEntries: ['/old'] }),
      isServer: false,
    })
    const oldMatches = router.matchRoutes(router.stores.location.get())

    mockWindow.$_TSR = {
      router: {
        manifest: testManifest,
        dehydratedData: {},
        lastMatchId: oldMatches[1]!.id,
        matches: oldMatches.map((match) => ({
          i: match.id,
          s: 'success' as const,
          ssr: true,
          u: Date.now(),
        })),
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    }

    await hydrate(router)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/new'))
    await router.latestLoadPromise

    expect(oldHead).not.toHaveBeenCalled()
    expect(oldScripts).not.toHaveBeenCalled()
    expect(newHead).toHaveBeenCalledTimes(1)
  })

  test.each(['resolve', 'reject'] as const)(
    'abandons a same-href hydration lane when its old route chunk %ss',
    async (chunkSettlement) => {
      const routeChunkGate = createControlledPromise<void>()
      const routeChunkError = new Error('old hydration chunk failed')
      const contextControllers: Array<AbortController> = []
      const headControllers: Array<AbortController> = []
      const scriptsControllers: Array<AbortController> = []

      const Page = Object.assign(() => null, {
        preload: vi.fn(() => routeChunkGate),
      })
      const routeContext = vi.fn(({ abortController }) => {
        contextControllers.push(abortController)
        return { source: 'same-href' }
      })
      const head = vi.fn(({ match }) => {
        headControllers.push(match.abortController)
        return { meta: [{ title: 'Same href' }] }
      })
      const scripts = vi.fn(({ match }) => {
        scriptsControllers.push(match.abortController)
        return [{ children: 'window.sameHrefHydrationRan = true' }]
      })

      const rootRoute = new BaseRootRoute({})
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        component: Page,
        context: routeContext,
        head,
        scripts,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([pageRoute]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer: false,
      })
      const dehydratedMatches = router.matchRoutes(router.stores.location.get())

      mockWindow.$_TSR = {
        router: {
          manifest: testManifest,
          dehydratedData: {},
          lastMatchId: dehydratedMatches[1]!.id,
          matches: dehydratedMatches.map((match) => ({
            i: match.id,
            s: 'success' as const,
            ssr: true,
            u: Date.now(),
          })),
        },
        h: vi.fn(),
        e: vi.fn(),
        c: vi.fn(),
        p: vi.fn(),
        buffer: [],
        initialized: false,
      }

      const hydration = hydrate(router)
      await vi.waitFor(() => expect(Page.preload).toHaveBeenCalledTimes(1))

      const hydrationLocation = router.stores.location.get()
      const oldMatches = router.stores.matches.get()
      const oldRoot = oldMatches[0]!
      const oldPage = oldMatches[1]!

      // Ignore context calls made while initially matching the hydration lane.
      // Calls observed from here would belong to either the replacement load
      // or the stale post-chunk hydration reconstruction.
      routeContext.mockClear()
      contextControllers.length = 0

      await router.load()

      const replacementMatches = router.stores.matches.get()
      const replacementRoot = replacementMatches[0]!
      const replacementPage = replacementMatches[1]!
      const resolvedAfterReplacement = router.stores.resolvedLocation.get()

      expect(router.stores.location.get().href).toBe(hydrationLocation.href)
      expect(replacementRoot.abortController).not.toBe(oldRoot.abortController)
      expect(replacementPage.abortController).not.toBe(oldPage.abortController)
      expect(headControllers).toEqual([replacementPage.abortController])
      expect(scriptsControllers).toEqual([replacementPage.abortController])
      expect(contextControllers).not.toContain(oldPage.abortController)

      if (chunkSettlement === 'resolve') {
        routeChunkGate.resolve()
      } else {
        routeChunkGate.reject(routeChunkError)
      }

      await expect(hydration).resolves.toBeUndefined()

      expect(oldMatches.every((match) => !match._.loadPromise)).toBe(true)
      expect(router.stores.matches.get()[0]).toBe(replacementRoot)
      expect(router.stores.matches.get()[1]).toBe(replacementPage)
      expect(replacementRoot.abortController.signal.aborted).toBe(false)
      expect(replacementPage.abortController.signal.aborted).toBe(false)
      expect(replacementPage.status).toBe('success')
      expect(replacementPage.meta).toEqual([{ title: 'Same href' }])
      expect(replacementPage.scripts).toEqual([
        { children: 'window.sameHrefHydrationRan = true' },
      ])
      expect(router.stores.resolvedLocation.get()).toBe(
        resolvedAfterReplacement,
      )
      expect(headControllers).not.toContain(oldPage.abortController)
      expect(scriptsControllers).not.toContain(oldPage.abortController)
      expect(contextControllers).not.toContain(oldPage.abortController)
    },
  )
})
