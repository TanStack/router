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
    let navigation: Promise<void> | undefined
    let navigateDuringHydration = false
    const rootRoute = new BaseRootRoute({})
    const oldRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/old',
      context: () => {
        if (navigateDuringHydration) {
          navigateDuringHydration = false
          navigation = router.navigate({ to: '/new' })
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

    navigateDuringHydration = true
    await hydrate(router)
    await navigation

    expect(router.state.location.pathname).toBe('/new')
    expect(oldHead).not.toHaveBeenCalled()
    expect(oldScripts).not.toHaveBeenCalled()
    expect(newHead).toHaveBeenCalledTimes(1)
  })

  test('a same-href load owns route hooks when an older hydration chunk settles later', async () => {
    const routeChunkGate = createControlledPromise<void>()
    const Page = Object.assign(() => null, {
      preload: vi.fn(() => routeChunkGate),
    })
    const routeContext = vi.fn(() => ({ source: 'same-href' }))
    const head = vi.fn(() => ({ meta: [{ title: 'Same href' }] }))
    const scripts = vi.fn(() => [
      { children: 'window.sameHrefHydrationRan = true' },
    ])

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

    routeContext.mockClear()
    head.mockClear()
    scripts.mockClear()
    const replacement = router.load()
    routeChunkGate.resolve()

    await Promise.all([hydration, replacement])

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'success',
      meta: [{ title: 'Same href' }],
      scripts: [{ children: 'window.sameHrefHydrationRan = true' }],
    })
    expect(routeContext).toHaveBeenCalledTimes(1)
    expect(head).toHaveBeenCalledTimes(1)
    expect(scripts).toHaveBeenCalledTimes(1)
  })
})
