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

test('retiring a mismatched hydration continuation keeps recovered descendant loader work alive', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  let clientRouter: AnyRouter
  let childLoaderSignal: AbortSignal | undefined
  const cacheCleared = vi.fn()
  const parentLoader = vi.fn(() => 'client parent data')
  const childLoader = vi.fn(() => 'client child data')
  const createTree = (isServer: boolean, generation: number) => {
    const root = new BaseRootRoute({
      loaderDeps: () => ({ generation }),
      context: ({ abortController }) => {
        if (!isServer) {
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
    const parent = new BaseRoute({
      getParentRoute: () => root,
      path: '/parent',
      loader: {
        handler: isServer ? () => 'server parent data' : parentLoader,
        dehydrate: true,
        hydrate: async () => {
          // Let the independent child transform finish before this failure.
          await new Promise((resolve) => setTimeout(resolve))
          throw new Error('parent transform failed')
        },
      },
    })
    const child = new BaseRoute({
      getParentRoute: () => parent,
      path: '/child',
      staleTime: Infinity,
      loader: {
        handler: isServer ? () => 'server child data' : childLoader,
        dehydrate: true,
        hydrate: ({ data, abortController }) => {
          childLoaderSignal = abortController.signal
          return `${data}: hydrated`
        },
      },
    })
    return root.addChildren([parent.addChildren([child])])
  }
  const build = (isServer: boolean) => {
    return createTestRouter({
      routeTree: createTree(isServer, 0),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
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
    const recoveredSignal = childLoaderSignal!
    expect(recoveredSignal.aborted).toBe(false)
    expect(router.state.matches[1]?.status).toBe('pending')
    expect(router.state.matches.at(-1)?.loaderData).toBe(
      'server child data: hydrated',
    )
    expect(parentLoader).not.toHaveBeenCalled()
    expect(childLoader).not.toHaveBeenCalled()

    // A public route update changes the root key before planning. Its context
    // abort listener clears the child cache while the client load borrows it.
    router.update({ ...router.options, routeTree: createTree(false, 1) })
    await router.load()

    expect(cacheCleared).toHaveBeenCalledTimes(1)
    expect(parentLoader).toHaveBeenCalledTimes(1)
    expect(childLoader).not.toHaveBeenCalled()
    expect(recoveredSignal.aborted).toBe(false)
    expect(router.state.matches.at(-1)).toMatchObject({
      status: 'success',
      loaderData: 'server child data: hydrated',
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
