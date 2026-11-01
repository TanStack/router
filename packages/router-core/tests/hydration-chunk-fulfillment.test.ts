import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, notFound } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('a fulfilled false from a not-found component preload keeps the server boundary hydrated', async () => {
  const preload = vi.fn(() => Promise.resolve(false))
  const Boundary = Object.assign(() => null, { preload })
  const clientBeforeLoad = vi.fn(() => {
    throw notFound({ routeId: '/page' })
  })
  const build = (isServer: boolean) => {
    const root = new BaseRootRoute({})
    const page = new BaseRoute({
      getParentRoute: () => root,
      path: '/page',
      beforeLoad: isServer
        ? () => {
            throw notFound({ routeId: '/page' })
          }
        : clientBeforeLoad,
      notFoundComponent: isServer ? () => null : Boundary,
    })
    return createTestRouter({
      routeTree: root.addChildren([page]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer,
      scrollRestoration: false,
    })
  }
  const server = build(true)
  const router = build(false)
  try {
    vi.stubGlobal('window', {
      $_TSR: await dehydrateToBootstrap(server, { routes: {} }),
    })
    expect(server.state.matches.at(-1)?.status).toBe('notFound')

    await hydrate(router)

    expect(preload).toHaveBeenCalledOnce()
    expect(clientBeforeLoad).not.toHaveBeenCalled()
    expect(router.state.matches.at(-1)?.status).toBe('notFound')
    expect(router.state.resolvedLocation?.pathname).toBe('/page')
  } finally {
    router.clearCache()
    router.history.destroy()
    server.clearCache()
    server.history.destroy()
  }
})
