import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { processDeferredArr, scheduleDeferredReEval } from '../src/defer'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { hydrate } from '../src/ssr/client'
import { createTestRouter } from './routerTestUtils'
import type { TsrSsrGlobal } from '../src/ssr/types'

describe('processDeferredArr', () => {
  describe('shouldAwait=false (non-bot SSR or client load)', () => {
    it('skips deferred entries from the initial result (client re-eval will surface them)', async () => {
      const meta = [
        { name: 'twitter:site', content: '@mysite' },
        Promise.resolve([
          { title: 'Async Title' },
          { property: 'og:title', content: 'OG Title' },
        ]),
      ]

      const result = await processDeferredArr('/product/shoe', meta, 'meta', false)

      expect(result).toEqual([{ name: 'twitter:site', content: '@mysite' }])
    })

    it('returns the array unchanged when no entries are promises', async () => {
      const meta = [{ title: 'Hello' }, { name: 'desc', content: 'World' }]
      const result = await processDeferredArr('/p', meta, 'meta', false)
      expect(result).toEqual(meta)
    })
  })

  describe('shouldAwait=true (bot SSR or client re-eval)', () => {
    it('awaits promises and returns resolved values inline (Googlebot)', async () => {
      const meta = [
        { name: 'robots', content: 'index' },
        Promise.resolve([
          { title: 'Product Name' },
          { property: 'og:title', content: 'OG Product' },
        ]),
      ]

      const result = await processDeferredArr('/product/1', meta, 'meta', true)

      expect(result).toEqual([
        { name: 'robots', content: 'index' },
        { title: 'Product Name' },
        { property: 'og:title', content: 'OG Product' },
      ])
    })

    it('flattens resolved arrays into the surrounding head array (Twitterbot)', async () => {
      const links = [
        { rel: 'icon', href: '/icon.png' },
        Promise.resolve([
          { rel: 'canonical', href: 'https://example.com/page' },
          {
            rel: 'alternate',
            hrefLang: 'es',
            href: 'https://example.com/es/page',
          },
        ]),
      ]

      const result = await processDeferredArr('/page', links, 'links', true)

      expect(result).toEqual([
        { rel: 'icon', href: '/icon.png' },
        { rel: 'canonical', href: 'https://example.com/page' },
        {
          rel: 'alternate',
          hrefLang: 'es',
          href: 'https://example.com/es/page',
        },
      ])
    })

    it('includes resolved deferred values in the result (client re-eval pass)', async () => {
      // Re-evaluation pass after the original loader promise has settled.
      // The new `.then()` chain in head() resolves on the next microtask,
      // and we need its value in match.meta so the UI updates.
      const dataPromise = Promise.resolve({ title: 'Loaded' })
      await dataPromise

      const meta = [
        { name: 'twitter:site', content: '@mysite' },
        dataPromise.then((data) => [
          { title: data.title },
          { name: 'description', content: 'desc' },
        ]),
      ]

      const result = await processDeferredArr('/p', meta, 'meta', true)

      expect(result).toEqual([
        { name: 'twitter:site', content: '@mysite' },
        { title: 'Loaded' },
        { name: 'description', content: 'desc' },
      ])
    })
  })

  describe('error handling', () => {
    it('logs and skips a rejected promise but keeps other entries (shouldAwait=true)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const meta = [
        { name: 'static', content: 'present' },
        Promise.reject(new Error('upstream down')),
      ]

      const result = await processDeferredArr('/p', meta, 'meta', true)

      expect(result).toEqual([{ name: 'static', content: 'present' }])
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deferred meta promise rejected'),
        expect.any(Error),
      )
      consoleSpy.mockRestore()
    })
  })

  describe('edge cases', () => {
    it('drops null resolved values', async () => {
      const arr = [Promise.resolve(null)]
      const result = await processDeferredArr('/p', arr, 'links', true)
      expect(result).toHaveLength(0)
    })

    it('accepts a promise that resolves to a single descriptor (no array)', async () => {
      const arr = [Promise.resolve({ rel: 'stylesheet', href: '/single.css' })]
      const result = await processDeferredArr('/p', arr, 'links', true)
      expect(result).toEqual([{ rel: 'stylesheet', href: '/single.css' }])
    })
  })
})

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
      // Re-eval pass returns a brand-new unresolved promise that the
      // awaitClient=true path must await before updating the match.
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

    // Trigger re-evaluation by resolving the original deferred promise.
    originalPromise.resolve({ title: 'unused' })
    // Yield enough microtasks for the re-eval to start and call head() again,
    // but not enough for it to finish (secondPromise is still pending).
    await new Promise((r) => setTimeout(r, 10))

    expect(headFn).toHaveBeenCalledTimes(2)
    // Match should still hold the first-pass static entries; re-eval is
    // blocked on secondPromise.
    expect(router.getMatch(indexMatchId)!.meta).toEqual([
      { name: 'static', content: 'present' },
    ])

    // Resolve the new promise — re-eval should now finish and commit it.
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
    // isbot only flags a UA when it matches a known crawler signature;
    // an absent/empty UA is treated as a non-bot client.
    expect(router.serverSsr.isBot).toBe(false)
  })

  it('leaves isBot undefined when no request is provided (legacy callers can still set it manually)', () => {
    const router: any = newServerRouter()
    attachRouterServerSsrUtils({ router, manifest: undefined })
    expect(router.serverSsr.isBot).toBeUndefined()
  })
})

// `hydrate` mirrors `executeHead`: the first pass commits only static head
// entries so hydration is never blocked by a pending loader promise. If any
// field carried a promise, a `Promise.allSettled`-driven re-evaluation pass
// re-runs head()/scripts() and commits the resolved values through the store
// so `<HeadContent />` / `<Scripts />` subscribers see them.
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
    // A non-Start consumer hands hydrate a loader whose deferred promise
    // has not yet settled. Hydrate must complete immediately and let the
    // re-evaluation pass commit the resolved values when they arrive.
    const mockMatches = setupDehydrated({ dataPromise })

    let hydrationDone = false
    const hydratePromise = hydrate(mockRouter).then(() => {
      hydrationDone = true
    })

    // Yield enough microtasks for hydrate's async work to settle.
    await new Promise((r) => setTimeout(r, 10))

    expect(hydrationDone).toBe(true)
    await hydratePromise

    // First pass committed static entries only — re-eval is queued behind
    // the still-pending dataPromise.
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

describe('scheduleDeferredReEval', () => {
  it('is a no-op when no field carries a Promise', async () => {
    const headFn = vi.fn(() => ({ meta: [{ name: 'static' }] }))
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      head: headFn,
    })
    rootRoute.addChildren([indexRoute])

    const router = createTestRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()
    headFn.mockClear()

    scheduleDeferredReEval(
      router as any,
      router.state.matches.find((m) => m.routeId === '/')!.id,
      router.looseRoutesById['/'] as any,
      router.state.matches as any,
      { meta: [{ name: 'static' }] },
      'load',
    )

    await new Promise((r) => setTimeout(r, 10))
    expect(headFn).not.toHaveBeenCalled()
  })

  it('logs a re-eval error to console.error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const rootRoute = new BaseRootRoute({})
    let callCount = 0
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      head: () => {
        callCount++
        if (callCount === 1) {
          // First pass: include a promise so re-eval gets scheduled.
          return { meta: [Promise.resolve([{ title: 'first' }])] }
        }
        // Re-eval pass: throw synchronously so the catch in
        // scheduleDeferredReEval fires.
        throw new Error('re-eval boom')
      },
    })
    rootRoute.addChildren([indexRoute])

    const router = createTestRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await new Promise((r) => setTimeout(r, 20))

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Error re-evaluating deferred head/scripts (load)',
      ),
      expect.any(Error),
    )
    consoleSpy.mockRestore()
  })

  it('disambiguates load vs hydrate in error messages via the source argument', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      head: () => ({ meta: [{ name: 'static' }] }),
    })
    rootRoute.addChildren([indexRoute])

    const router = createTestRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    // Load so the router has a real match for '/' to look up; otherwise
    // scheduleDeferredReEval's `getMatch` guard returns early before logging.
    await router.load()
    const matchId = router.state.matches.find((m) => m.routeId === '/')!.id

    // Drive the helper directly with `source: 'hydrate'` and a synthetic
    // route whose head() throws synchronously, so we assert the label
    // without simulating a full hydrate cycle.
    scheduleDeferredReEval(
      router as any,
      matchId,
      {
        options: {
          head: () => {
            throw new Error('hydrate-boom')
          },
        },
      } as any,
      router.state.matches as any,
      { meta: [Promise.resolve([{ title: 'x' }])] },
      'hydrate',
    )
    await new Promise((r) => setTimeout(r, 20))

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Error re-evaluating deferred head/scripts (hydrate)',
      ),
      expect.any(Error),
    )
    consoleSpy.mockRestore()
  })
})
