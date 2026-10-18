import { createMemoryHistory } from '@tanstack/history'
import { afterEach, expect, test, vi } from 'vitest'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  redirect,
} from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test.each(
  (['return', 'throw'] as const).flatMap((mode) =>
    [false, true].map((searchThrows) => ({ mode, searchThrows })),
  ),
)(
  'a loader hydrate that $mode redirects defers destination callbacks (search throws: $searchThrows)',
  async ({ mode, searchThrows }) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const targetError = new Error('redirect search callback failed')
    const onError = vi.fn()
    const search = vi.fn(() => {
      if (searchThrows) {
        throw targetError
      }
      return { destination: 'target' }
    })
    const build = (isServer: boolean) => {
      const root = new BaseRootRoute({})
      const page = new BaseRoute({
        getParentRoute: () => root,
        path: '/page',
        loader: {
          handler: () => 'handler data',
          dehydrate: true,
          hydrate: () => {
            const result = redirect({ to: '/target', search })
            if (mode === 'throw') {
              throw result
            }
            return result
          },
        },
        onError,
      })
      const target = new BaseRoute({
        getParentRoute: () => root,
        path: '/target',
      })
      return createTestRouter({
        routeTree: root.addChildren([page, target]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer,
      })
    }
    const server = build(true)
    const client = build(false)
    try {
      const bootstrap = await dehydrateToBootstrap(server, { routes: {} })
      vi.stubGlobal('window', { $_TSR: bootstrap })
      await hydrate(client)
      expect({
        destinationCalls: search.mock.calls.length,
        onErrorCalls: onError.mock.calls.length,
      }).toEqual({ destinationCalls: 0, onErrorCalls: 0 })
      await client.load()
      expect(client.state.location.pathname).toBe('/page')
      expect(client.state.matches.at(-1)?.loaderData).toBe('handler data')
      expect(search).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
    } finally {
      server.history.destroy()
      client.history.destroy()
    }
  },
)

test.each([false, true])(
  'an adopted hydration loader resolves its redirect in the client load (search throws: %s)',
  async (searchThrows) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const started = createControlledPromise<void>()
    const loaderGate = createControlledPromise<void>()
    const guardGate = createControlledPromise<void>()
    const targetError = new Error('adopted redirect search failed')
    const onError = vi.fn()
    const search = vi.fn(() => {
      if (searchThrows) {
        throw targetError
      }
      return { destination: 'target' }
    })
    const clientHandler = vi.fn(() => 'unexpected second loader')
    const build = (isServer: boolean) => {
      const root = new BaseRootRoute({})
      const page = new BaseRoute({
        getParentRoute: () => root,
        path: '/page',
        beforeLoad: {
          handler: async () => {
            if (!isServer) {
              await guardGate
            }
            return {}
          },
          dehydrate: true,
        },
        loader: {
          handler: isServer ? () => 'server data' : clientHandler,
          dehydrate: true,
          hydrate: async () => {
            started.resolve()
            await loaderGate
            return redirect({ to: '/target', search })
          },
        },
        onError,
      })
      const target = new BaseRoute({
        getParentRoute: () => root,
        path: '/target',
      })
      return createTestRouter({
        routeTree: root.addChildren([page, target]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer,
      })
    }
    const server = build(true)
    const client = build(false)
    let hydration: Promise<void> | undefined
    let load: Promise<void> | undefined
    try {
      const bootstrap = await dehydrateToBootstrap(server, { routes: {} })
      vi.stubGlobal('window', { $_TSR: bootstrap })
      hydration = hydrate(client)
      await started
      load = client.load({ sync: true })
      await hydration
      expect(search).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
      guardGate.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
      loaderGate.resolve()
      await load
      expect(clientHandler).not.toHaveBeenCalled()
      expect(search).toHaveBeenCalledTimes(1)
      if (searchThrows) {
        expect(onError).toHaveBeenCalledExactlyOnceWith(targetError)
        expect(client.state.location.pathname).toBe('/page')
        expect(client.state.matches.at(-1)?.status).toBe('error')
      } else {
        expect(onError).not.toHaveBeenCalled()
        expect(client.state.location.pathname).toBe('/target')
      }
    } finally {
      guardGate.resolve()
      loaderGate.resolve()
      await hydration
      await load
      server.history.destroy()
      client.history.destroy()
    }
  },
)
