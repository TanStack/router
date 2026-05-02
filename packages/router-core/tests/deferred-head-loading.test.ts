import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  buildMetaTags,
  createControlledPromise,
  dedupByLastKey,
} from '../src'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { hydrate } from '../src/ssr/client'
import { createTestRouter } from './routerTestUtils'
import type { TsrSsrGlobal } from '../src/ssr/types'

describe('executeHead: client re-evaluation through loadMatches', () => {
  it('first pass returns only static entries; deferred entries land on match after the re-eval', async () => {
    const dataPromise = createControlledPromise<{ title: string }>()

    const headFn = vi.fn(({ loaderData }: { loaderData?: any }) => ({
      meta: [
        { name: 'twitter:site', content: '@mysite' },
        loaderData?.dataPromise.then((data: { title: string }) => [
          { title: data.title },
          { name: 'description', content: 'deferred' },
        ]),
      ],
    }))

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => ({ dataPromise }),
      head: headFn,
    })
    const routeTree = rootRoute.addChildren([indexRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const indexMatchId = router.state.matches.find((m) => m.routeId === '/')!.id
    let match = router.getMatch(indexMatchId)!
    expect(match.meta).toEqual([{ name: 'twitter:site', content: '@mysite' }])
    expect(headFn).toHaveBeenCalledTimes(1)

    dataPromise.resolve({ title: 'Loaded' })
    await new Promise((r) => setTimeout(r, 10))

    expect(headFn).toHaveBeenCalledTimes(2)

    match = router.getMatch(indexMatchId)!
    expect(match.meta).toEqual([
      { name: 'twitter:site', content: '@mysite' },
      { title: 'Loaded' },
      { name: 'description', content: 'deferred' },
    ])
  })

  it('does not schedule a re-evaluation when head() has no deferred entries', async () => {
    const headFn = vi.fn(() => ({
      meta: [{ name: 'description', content: 'static' }],
    }))

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      head: headFn,
    })
    const routeTree = rootRoute.addChildren([indexRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await new Promise((r) => setTimeout(r, 10))
    expect(headFn).toHaveBeenCalledTimes(1)
  })

  it('safely updates a cached match when deferred promises settle after the user navigated away', async () => {
    const dataPromise = createControlledPromise<{ title: string }>()

    const rootRoute = new BaseRootRoute({})
    const slowRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/slow',
      loader: () => ({ dataPromise }),
      head: ({ loaderData }: { loaderData?: any }) => ({
        meta: [
          { name: 'static', content: 'present' },
          loaderData?.dataPromise.then((d: { title: string }) => [
            { title: d.title },
          ]),
        ],
      }),
    })
    const fastRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/fast',
      head: () => ({ meta: [{ name: 'description', content: 'fast page' }] }),
    })
    const routeTree = rootRoute.addChildren([slowRoute, fastRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/slow'] }),
    })
    await router.load()

    await router.navigate({ to: '/fast' })
    await router.load()

    dataPromise.resolve({ title: 'Late arrival' })
    await new Promise((r) => setTimeout(r, 10))

    const fastMatch = router.state.matches.find((m) => m.routeId === '/fast')!
    expect(fastMatch.meta).toEqual([
      { name: 'description', content: 'fast page' },
    ])
  })

  // Re-eval re-runs head() and scripts() but does not re-run headers().
  // headers() is a server-only response-headers contract; recomputing it on the
  // client would be both wasteful and meaningless.
  it('does not re-invoke headers() during client re-evaluation', async () => {
    const dataPromise = createControlledPromise<{ title: string }>()

    const headFn = vi.fn(({ loaderData }: { loaderData?: any }) => ({
      meta: [
        { name: 'static', content: 'present' },
        loaderData?.dataPromise.then((d: { title: string }) => [
          { title: d.title },
        ]),
      ],
    }))
    const headersFn = vi.fn(() => ({ 'x-custom': 'value' }))
    const scriptsFn = vi.fn(() => [])

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => ({ dataPromise }),
      head: headFn,
      headers: headersFn,
      scripts: scriptsFn,
    } as any)
    const routeTree = rootRoute.addChildren([indexRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    expect(headFn).toHaveBeenCalledTimes(1)
    expect(headersFn).toHaveBeenCalledTimes(1)
    expect(scriptsFn).toHaveBeenCalledTimes(1)

    dataPromise.resolve({ title: 'Loaded' })
    await new Promise((r) => setTimeout(r, 10))

    // head() and scripts() re-run on the re-eval pass; headers() must not.
    expect(headFn).toHaveBeenCalledTimes(2)
    expect(scriptsFn).toHaveBeenCalledTimes(2)
    expect(headersFn).toHaveBeenCalledTimes(1)
  })

  // The re-eval pass passes the snapshot of `inner.matches` from the
  // load that started it. Even after a follow-up navigation, the second head()
  // call still receives the original matches array.
  it('passes the same matches snapshot to head() on the re-evaluation pass', async () => {
    const dataPromise = createControlledPromise<{ title: string }>()

    const matchesSeen: Array<Array<unknown>> = []
    const headFn = ({
      matches,
      loaderData,
    }: {
      matches: Array<unknown>
      loaderData?: any
    }) => {
      matchesSeen.push(matches)
      return {
        meta: [
          { name: 'static', content: 'present' },
          loaderData?.dataPromise.then((d: { title: string }) => [
            { title: d.title },
          ]),
        ],
      }
    }

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => ({ dataPromise }),
      head: headFn,
    })
    const routeTree = rootRoute.addChildren([indexRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    expect(matchesSeen).toHaveLength(1)

    dataPromise.resolve({ title: 'Loaded' })
    await new Promise((r) => setTimeout(r, 10))

    expect(matchesSeen).toHaveLength(2)
    // Same array reference: re-eval reuses the original load's snapshot
    // rather than reading the live (possibly-stale) match store.
    expect(matchesSeen[1]).toBe(matchesSeen[0])
  })

  // If the re-evaluation's head() returns *new* unresolved promises,
  // they are awaited under awaitClient=true and their resolved values land on
  // the match. (Practically only happens when the user creates fresh promises
  // inside head() — uncommon, but the contract should still hold.)
  it('awaits new unresolved promises returned during the re-evaluation pass', async () => {
    const originalPromise = createControlledPromise<{ title: string }>()
    const secondPromise = createControlledPromise<Array<{ title: string }>>()

    let callCount = 0
    const headFn = vi.fn(({ loaderData }: { loaderData?: any }) => {
      callCount++
      if (callCount === 1) {
        return {
          meta: [
            { name: 'static', content: 'present' },
            loaderData?.dataPromise.then(() => [{ title: 'first-pass' }]),
          ],
        }
      }
      return {
        meta: [{ name: 'static', content: 'present' }, secondPromise],
      }
    })

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => ({ dataPromise: originalPromise }),
      head: headFn,
    })
    const routeTree = rootRoute.addChildren([indexRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const indexMatchId = router.state.matches.find((m) => m.routeId === '/')!.id

    originalPromise.resolve({ title: 'unused' })
    await new Promise((r) => setTimeout(r, 10))

    expect(headFn).toHaveBeenCalledTimes(2)
    expect(router.getMatch(indexMatchId)!.meta).toEqual([
      { name: 'static', content: 'present' },
    ])

    secondPromise.resolve([{ title: 'second-pass' }])
    await new Promise((r) => setTimeout(r, 10))

    expect(router.getMatch(indexMatchId)!.meta).toEqual([
      { name: 'static', content: 'present' },
      { title: 'second-pass' },
    ])
  })
})

describe('executeHead: deferred body scripts', () => {
  it('first pass commits only static body scripts; deferred entries land after re-eval', async () => {
    const dataPromise = createControlledPromise<{ src: string }>()

    const scriptsFn = vi.fn(({ loaderData }: { loaderData?: any }) => [
      { children: 'console.log("static")' },
      loaderData?.dataPromise.then((d: { src: string }) => [{ src: d.src }]),
    ])

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => ({ dataPromise }),
      scripts: scriptsFn,
    } as any)
    const routeTree = rootRoute.addChildren([indexRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const indexMatchId = router.state.matches.find((m) => m.routeId === '/')!.id
    let match = router.getMatch(indexMatchId)!
    expect(match.scripts).toEqual([{ children: 'console.log("static")' }])
    expect(scriptsFn).toHaveBeenCalledTimes(1)

    dataPromise.resolve({ src: '/analytics.js' })
    await new Promise((r) => setTimeout(r, 10))

    expect(scriptsFn).toHaveBeenCalledTimes(2)

    match = router.getMatch(indexMatchId)!
    expect(match.scripts).toEqual([
      { children: 'console.log("static")' },
      { src: '/analytics.js' },
    ])
  })

  it('schedules a single re-eval when both head() and body scripts have deferred entries', async () => {
    const dataPromise =
      createControlledPromise<{ title: string; src: string }>()

    const headFn = vi.fn(({ loaderData }: { loaderData?: any }) => ({
      meta: [
        { name: 'static', content: 'present' },
        loaderData?.dataPromise.then((d: { title: string }) => [
          { title: d.title },
        ]),
      ],
    }))
    const scriptsFn = vi.fn(({ loaderData }: { loaderData?: any }) => [
      { children: 'console.log("static")' },
      loaderData?.dataPromise.then((d: { src: string }) => [{ src: d.src }]),
    ])

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => ({ dataPromise }),
      head: headFn,
      scripts: scriptsFn,
    } as any)
    const routeTree = rootRoute.addChildren([indexRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    expect(headFn).toHaveBeenCalledTimes(1)
    expect(scriptsFn).toHaveBeenCalledTimes(1)

    dataPromise.resolve({ title: 'Loaded', src: '/late.js' })
    await new Promise((r) => setTimeout(r, 10))

    expect(headFn).toHaveBeenCalledTimes(2)
    expect(scriptsFn).toHaveBeenCalledTimes(2)

    const indexMatchId = router.state.matches.find((m) => m.routeId === '/')!.id
    const match = router.getMatch(indexMatchId)!
    expect(match.meta).toEqual([
      { name: 'static', content: 'present' },
      { title: 'Loaded' },
    ])
    expect(match.scripts).toEqual([
      { children: 'console.log("static")' },
      { src: '/late.js' },
    ])
  })

  it('does not schedule a re-eval when body scripts contain no promises', async () => {
    const scriptsFn = vi.fn(() => [{ children: 'console.log("static")' }])

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      scripts: scriptsFn,
    } as any)
    const routeTree = rootRoute.addChildren([indexRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await new Promise((r) => setTimeout(r, 10))
    expect(scriptsFn).toHaveBeenCalledTimes(1)
  })

  it('safely updates a cached match when deferred body scripts settle after the user navigated away', async () => {
    const dataPromise = createControlledPromise<{ src: string }>()

    const rootRoute = new BaseRootRoute({})
    const slowRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/slow',
      loader: () => ({ dataPromise }),
      scripts: ({ loaderData }: { loaderData?: any }) => [
        { children: 'console.log("static")' },
        loaderData?.dataPromise.then((d: { src: string }) => [{ src: d.src }]),
      ],
    } as any)
    const fastRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/fast',
      scripts: () => [{ children: 'console.log("fast")' }],
    } as any)
    const routeTree = rootRoute.addChildren([slowRoute, fastRoute])

    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/slow'] }),
    })
    await router.load()

    await router.navigate({ to: '/fast' })
    await router.load()

    dataPromise.resolve({ src: '/late.js' })
    await new Promise((r) => setTimeout(r, 10))

    const fastMatch = router.state.matches.find((m) => m.routeId === '/fast')!
    expect(fastMatch.scripts).toEqual([{ children: 'console.log("fast")' }])
  })
})

// `attachRouterServerSsrUtils` accepts an optional `request` and computes
// `serverSsr.isBot` from its User-Agent header so that both Start
// (`createStartHandler`) and non-Start (`createRequestHandler`) consumers
// get crawler-aware deferred head loading without manually setting `isBot`.
describe('attachRouterServerSsrUtils: automatic bot detection', () => {
  function newServerRouter() {
    return createTestRouter({
      routeTree: new BaseRootRoute({}),
      history: createMemoryHistory(),
      isServer: true,
    })
  }

  it('flags a Googlebot User-Agent', () => {
    const router: any = newServerRouter()
    attachRouterServerSsrUtils({
      router,
      manifest: undefined,
      request: new Request('http://localhost/', {
        headers: {
          'user-agent':
            'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        },
      }),
    })
    expect(router.serverSsr.isBot).toBe(true)
  })

  it('does not flag a normal Chrome User-Agent', () => {
    const router: any = newServerRouter()
    attachRouterServerSsrUtils({
      router,
      manifest: undefined,
      request: new Request('http://localhost/', {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        },
      }),
    })
    expect(router.serverSsr.isBot).toBe(false)
  })

  it('treats a missing User-Agent header as not-a-bot', () => {
    const router: any = newServerRouter()
    attachRouterServerSsrUtils({
      router,
      manifest: undefined,
      request: new Request('http://localhost/'),
    })
    // isbot treats an absent/empty UA as a non-bot client.
    expect(router.serverSsr.isBot).toBe(false)
  })

  it('leaves isBot undefined when no request is provided (legacy callers can still set it manually)', () => {
    const router: any = newServerRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    expect(router.serverSsr.isBot).toBeUndefined()
  })
})

// Mirrors `executeHead`: first pass commits only static entries so hydration
// is never blocked by a pending promise. A re-evaluation pass commits resolved
// values through the store once deferred promises settle.
describe('hydrate: deferred head loading', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }
  let dataPromise: ReturnType<
    typeof createControlledPromise<{ title: string; src: string }>
  >
  let mockRouter: any
  let headFn: ReturnType<typeof vi.fn>
  let scriptsFn: ReturnType<typeof vi.fn>
  let originalWindow: unknown

  beforeEach(() => {
    // Snapshot whatever the test environment (jsdom) had before so afterEach
    // can restore it. Without this, deleting `global.window` here leaks into
    // later tests that rely on jsdom's window for RouterCore.update().
    originalWindow = (global as any).window
    mockWindow = {}
    ;(global as any).window = mockWindow
    dataPromise = createControlledPromise<{ title: string; src: string }>()

    headFn = vi.fn(({ loaderData }: { loaderData?: any }) => ({
      meta: [
        { name: 'static', content: 'present' },
        loaderData?.dataPromise.then((d: { title: string }) => [
          { title: d.title },
        ]),
      ],
    }))

    scriptsFn = vi.fn(({ loaderData }: { loaderData?: any }) => [
      { children: 'console.log("static")' },
      loaderData?.dataPromise.then((d: { src: string }) => [{ src: d.src }]),
    ])

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      head: headFn,
      scripts: scriptsFn,
    } as any)
    const routeTree = rootRoute.addChildren([indexRoute])

    mockRouter = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
    if (originalWindow === undefined) {
      delete (global as any).window
    } else {
      ;(global as any).window = originalWindow
    }
  })

  function setupDehydrated(loaderData: any, router: any = mockRouter) {
    const mockMatches: Array<any> = [
      { id: '/', routeId: '/', index: 0, ssr: undefined, _nonReactive: {} },
    ]
    router.matchRoutes = vi.fn().mockReturnValue(mockMatches)
    router.state.matches = mockMatches

    mockWindow.$_TSR = {
      router: {
        manifest: { routes: {} },
        dehydratedData: {},
        lastMatchId: '/',
        matches: [
          { i: '/', l: loaderData, s: 'success', ssr: true, u: Date.now() },
        ],
      },
      h: vi.fn(),
      e: vi.fn(),
      c: vi.fn(),
      p: vi.fn(),
      buffer: [],
      initialized: false,
    } as any

    return mockMatches
  }

  it('does not block hydration on a still-pending deferred head promise', async () => {
    const mockMatches = setupDehydrated({ dataPromise })

    let hydrationDone = false
    const hydratePromise = hydrate(mockRouter).then(() => {
      hydrationDone = true
    })

    // Yield enough microtasks for hydrate's async work to settle.
    await new Promise((r) => setTimeout(r, 10))

    expect(hydrationDone).toBe(true)
    await hydratePromise

    expect(mockMatches[0].meta).toEqual([
      { name: 'static', content: 'present' },
    ])
    expect(mockMatches[0].scripts).toEqual([
      { children: 'console.log("static")' },
    ])
    expect(headFn).toHaveBeenCalledTimes(1)
    expect(scriptsFn).toHaveBeenCalledTimes(1)
  })

  it('commits resolved values to the store after the pending promise settles', async () => {
    setupDehydrated({ dataPromise })

    await hydrate(mockRouter)

    dataPromise.resolve({ title: 'Late', src: '/late.js' })
    await new Promise((r) => setTimeout(r, 10))

    // Re-eval re-runs head()/scripts() and commits via updateMatch, so the
    // resolved values are visible through `router.getMatch`.
    expect(headFn).toHaveBeenCalledTimes(2)
    expect(scriptsFn).toHaveBeenCalledTimes(2)

    const matchAfter = mockRouter.getMatch('/')!
    expect(matchAfter.meta).toEqual([
      { name: 'static', content: 'present' },
      { title: 'Late' },
    ])
    expect(matchAfter.scripts).toEqual([
      { children: 'console.log("static")' },
      { src: '/late.js' },
    ])
  })

  it('eventually commits resolved values when promises were pre-settled (streaming-SSR happy path)', async () => {
    // In Start's streaming SSR, the inline `<script>` resolving the loader's
    // deferred value runs before the client entry, so by the time hydrate
    // is called the dataPromise is already settled. Re-eval microtasks
    // chain off the already-resolved promise and commit on the next tick.
    dataPromise.resolve({ title: 'Loaded', src: '/late.js' })
    await dataPromise

    setupDehydrated({ dataPromise })

    await hydrate(mockRouter)
    await new Promise((r) => setTimeout(r, 10))

    const matchAfter = mockRouter.getMatch('/')!
    expect(matchAfter.meta).toEqual([
      { name: 'static', content: 'present' },
      { title: 'Loaded' },
    ])
    expect(matchAfter.scripts).toEqual([
      { children: 'console.log("static")' },
      { src: '/late.js' },
    ])
  })

  it('does not schedule a re-evaluation when no field carries a promise', async () => {
    // No deferred entries — just static. No re-eval should be scheduled.
    const staticHeadFn = vi.fn(() => ({
      meta: [{ name: 'static', content: 'present' }],
    }))
    const staticScriptsFn = vi.fn(() => [{ children: 'static' }])

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      head: staticHeadFn,
      scripts: staticScriptsFn,
    } as any)
    rootRoute.addChildren([indexRoute])

    const router: any = createTestRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })
    setupDehydrated({}, router)

    await hydrate(router)
    await new Promise((r) => setTimeout(r, 10))

    expect(staticHeadFn).toHaveBeenCalledTimes(1)
    expect(staticScriptsFn).toHaveBeenCalledTimes(1)
  })
})

// Bot SSR (`serverSsr.isBot=true`) is the inverse of the client/non-bot path:
// deferred head entries must be awaited inline on the first `resolveDeferredHead` so the
// HTML rendered for the crawler already contains the resolved tags.
describe('bot SSR: awaits deferred head entries inline', () => {
  it('inlines resolved deferred meta on the first load (Googlebot)', async () => {
    const dataPromise = createControlledPromise<{ title: string }>()

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => ({ dataPromise }),
      head: ({ loaderData }: { loaderData?: any }) => ({
        meta: [
          { name: 'twitter:site', content: '@mysite' },
          loaderData?.dataPromise.then((d: { title: string }) => [
            { title: d.title },
            { name: 'description', content: 'deferred' },
          ]),
        ],
      }),
    })
    rootRoute.addChildren([indexRoute])

    const router: any = createTestRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })
    attachRouterServerSsrUtils({
      router,
      manifest: undefined,
      request: new Request('http://localhost/', {
        headers: {
          'user-agent':
            'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        },
      }),
    })

    dataPromise.resolve({ title: 'Loaded' })
    await router.load()

    const match = router.state.matches.find((m: any) => m.routeId === '/')!
    expect(match.meta).toEqual([
      { name: 'twitter:site', content: '@mysite' },
      { title: 'Loaded' },
      { name: 'description', content: 'deferred' },
    ])
  })
})

describe('rejected deferred head promises', () => {
  it('keeps static entries and logs the rejection without crashing the load', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      head: () => ({
        meta: [
          { name: 'static', content: 'present' },
          Promise.reject(new Error('upstream down')),
        ],
      }),
    })
    rootRoute.addChildren([indexRoute])

    const router = createTestRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await new Promise((r) => setTimeout(r, 10))

    const match = router.state.matches.find((m) => m.routeId === '/')!
    expect(match.meta).toEqual([{ name: 'static', content: 'present' }])
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Deferred meta promise rejected'),
      expect.any(Error),
    )
    consoleSpy.mockRestore()
  })
})

describe('deferred fallbacks: key-based replacement at render time', () => {
  it('keyed link fallback is replaced by the deferred resolution', async () => {
    const dataPromise = createControlledPromise<{ canonical: string }>()

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => ({ dataPromise }),
      head: ({ loaderData }: { loaderData?: any }) => ({
        links: [
          { rel: 'canonical', href: '/fallback', key: 'canonical' },
          loaderData?.dataPromise.then((d: { canonical: string }) => [
            { rel: 'canonical', href: d.canonical, key: 'canonical' },
          ]),
        ],
      }),
    })
    rootRoute.addChildren([indexRoute])

    const router = createTestRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()

    // Fallback only — promise hasn't resolved yet.
    const matchId = router.state.matches.find((m) => m.routeId === '/')!.id
    let match = router.getMatch(matchId)!
    expect(match.links).toEqual([
      { rel: 'canonical', href: '/fallback', key: 'canonical' },
    ])
    expect(dedupByLastKey(match.links as any)).toEqual([
      { rel: 'canonical', href: '/fallback', key: 'canonical' },
    ])

    dataPromise.resolve({ canonical: '/resolved' })
    await new Promise((r) => setTimeout(r, 10))

    // Both entries are present in match data — render-time dedup picks the last.
    match = router.getMatch(matchId)!
    expect(match.links).toEqual([
      { rel: 'canonical', href: '/fallback', key: 'canonical' },
      { rel: 'canonical', href: '/resolved', key: 'canonical' },
    ])
    expect(dedupByLastKey(match.links as any)).toEqual([
      { rel: 'canonical', href: '/resolved', key: 'canonical' },
    ])
  })

  it('without a key, fallback and resolved links both survive — demonstrates why the key exists', async () => {
    const dataPromise = createControlledPromise<{ canonical: string }>()

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => ({ dataPromise }),
      head: ({ loaderData }: { loaderData?: any }) => ({
        links: [
          { rel: 'canonical', href: '/fallback' },
          loaderData?.dataPromise.then((d: { canonical: string }) => [
            { rel: 'canonical', href: d.canonical },
          ]),
        ],
      }),
    })
    rootRoute.addChildren([indexRoute])

    const router = createTestRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()

    dataPromise.resolve({ canonical: '/resolved' })
    await new Promise((r) => setTimeout(r, 10))

    const match = router.state.matches.find((m) => m.routeId === '/')!
    // dedupByLastKey is a no-op without keys — both links survive.
    expect(dedupByLastKey(match.links as any)).toEqual([
      { rel: 'canonical', href: '/fallback' },
      { rel: 'canonical', href: '/resolved' },
    ])
  })

  it('keyed body-script fallback is replaced by the deferred resolution', async () => {
    const dataPromise = createControlledPromise<{ src: string }>()

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => ({ dataPromise }),
      scripts: ({ loaderData }: { loaderData?: any }) => [
        { src: '/analytics-fallback.js', key: 'analytics' },
        loaderData?.dataPromise.then((d: { src: string }) => [
          { src: d.src, key: 'analytics' },
        ]),
      ],
    } as any)
    rootRoute.addChildren([indexRoute])

    const router = createTestRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()

    dataPromise.resolve({ src: '/analytics-resolved.js' })
    await new Promise((r) => setTimeout(r, 10))

    const match = router.state.matches.find((m) => m.routeId === '/')!
    expect(match.scripts).toEqual([
      { src: '/analytics-fallback.js', key: 'analytics' },
      { src: '/analytics-resolved.js', key: 'analytics' },
    ])
    expect(dedupByLastKey(match.scripts as any)).toEqual([
      { src: '/analytics-resolved.js', key: 'analytics' },
    ])
  })

  it('keyed JSON-LD fallback is replaced by the deferred resolution at render time', async () => {
    const dataPromise = createControlledPromise<{ name: string }>()

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => ({ dataPromise }),
      head: ({ loaderData }: { loaderData?: any }) => ({
        meta: [
          {
            'script:ld+json': { '@context': 'https://schema.org', name: '...' },
            key: 'product-ld',
          },
          loaderData?.dataPromise.then((d: { name: string }) => [
            {
              'script:ld+json': {
                '@context': 'https://schema.org',
                name: d.name,
              },
              key: 'product-ld',
            },
          ]),
        ],
      }),
    })
    rootRoute.addChildren([indexRoute])

    const router = createTestRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()

    dataPromise.resolve({ name: 'Resolved Product' })
    await new Promise((r) => setTimeout(r, 10))

    const match = router.state.matches.find((m) => m.routeId === '/')!
    // The raw match.meta still has both entries — the fallback drops out only
    // when the entries are normalized into rendered tags.
    expect(match.meta).toHaveLength(2)

    const tags = buildMetaTags([match.meta as any])
    const ldScripts = tags.filter((t) => t.tag === 'script')
    expect(ldScripts).toHaveLength(1)
    expect(ldScripts[0]!.children).toContain('Resolved Product')
    expect(ldScripts[0]!.children).not.toContain('"name":"...')
  })
})
