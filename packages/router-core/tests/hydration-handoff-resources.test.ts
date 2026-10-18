import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { hydrate } from '../src/ssr/client'
import type { AnyRouter } from '../src'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'

const manifest = { routes: {} }

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('retiring a mismatched hydration continuation keeps its borrowed cached loader signal alive', async () => {
  let generation = 0
  let clientRouter: AnyRouter
  let cachedLoaderSignal: AbortSignal | undefined
  const cacheCleared = vi.fn()
  const loader = vi.fn(
    ({ abortController }: { abortController: AbortController }) => {
      cachedLoaderSignal = abortController.signal
      return 'cached page data'
    },
  )
  const build = (isServer: boolean) => {
    const root = new BaseRootRoute({
      loaderDeps: () => ({ generation }),
      context: ({ abortController, preload }) => {
        if (!isServer && !preload) {
          abortController.signal.addEventListener(
            'abort',
            () => {
              cacheCleared()
              clientRouter.clearCache()
            },
            { once: true },
          )
        }
        return {}
      },
    })
    const page = new BaseRoute({
      getParentRoute: () => root,
      path: '/page',
      ssr: false,
      staleTime: Infinity,
      preloadStaleTime: Infinity,
      loader,
    })
    return createTestRouter({
      routeTree: root.addChildren([page]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer,
      scrollRestoration: false,
    })
  }
  const server = build(true)
  vi.stubGlobal('window', {
    $_TSR: await dehydrateToBootstrap(server, manifest),
  })
  const router = (clientRouter = build(false))
  try {
    await hydrate(router)
    await router.preloadRoute({ to: '/page' })
    expect(loader).toHaveBeenCalledTimes(1)
    const borrowedSignal = cachedLoaderSignal!
    expect(borrowedSignal.aborted).toBe(false)

    // A public dependency change rejects the reconstructed root. Retiring its
    // context controller clears the cache while this load already borrows it.
    generation++
    await router.load()

    expect(cacheCleared).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(borrowedSignal.aborted).toBe(false)
    expect(router.state.matches.at(-1)).toMatchObject({
      status: 'success',
      loaderData: 'cached page data',
    })
  } finally {
    router.clearCache()
    router.history.destroy()
    server.history.destroy()
  }
})

test('an accepted hydration continuation retains and later retires its transformed loader signal', async () => {
  let hydratedLoaderSignal: AbortSignal | undefined
  const clientLayoutLoader = vi.fn(() => 'client layout data')
  const pageLoader = vi.fn(() => 'client page data')
  const build = (isServer: boolean) => {
    const root = new BaseRootRoute({})
    const layout = new BaseRoute({
      getParentRoute: () => root,
      path: '/layout',
      loader: {
        handler: isServer ? () => 'server layout data' : clientLayoutLoader,
        dehydrate: true,
        hydrate: ({ data, abortController }) => {
          hydratedLoaderSignal = abortController.signal
          return `${data}: hydrated`
        },
      },
    })
    const page = new BaseRoute({
      getParentRoute: () => layout,
      path: '/page',
      ssr: false,
      loader: pageLoader,
    })
    const home = new BaseRoute({
      getParentRoute: () => root,
      path: '/',
    })
    return createTestRouter({
      routeTree: root.addChildren([home, layout.addChildren([page])]),
      history: createMemoryHistory({ initialEntries: ['/layout/page'] }),
      isServer,
      scrollRestoration: false,
    })
  }
  const server = build(true)
  vi.stubGlobal('window', {
    $_TSR: await dehydrateToBootstrap(server, manifest),
  })
  const router = build(false)
  try {
    await hydrate(router)
    const signal = hydratedLoaderSignal!
    expect(signal.aborted).toBe(false)
    await router.load()

    expect(signal.aborted).toBe(false)
    expect(clientLayoutLoader).not.toHaveBeenCalled()
    expect(pageLoader).toHaveBeenCalledTimes(1)
    expect(router.state.matches[1]?.loaderData).toBe(
      'server layout data: hydrated',
    )
    expect(router.state.matches.at(-1)?.loaderData).toBe('client page data')

    await router.navigate({ to: '/' })
    expect(signal.aborted).toBe(true)
    expect(router.state.resolvedLocation?.pathname).toBe('/')
  } finally {
    router.clearCache()
    router.history.destroy()
    server.history.destroy()
  }
})
