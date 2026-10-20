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

test.each(['success', 'error', 'redirect'] as const)(
  'a superseding client load runs its handler independently of a pending hydration transform (%s)',
  async (outcome) => {
    const started = createControlledPromise<void>()
    const codecGate = createControlledPromise<void>()
    const clientHandler = vi.fn(() => 'client handler data')
    const build = (isServer: boolean) => {
      const root = new BaseRootRoute({})
      const page = new BaseRoute({
        getParentRoute: () => root,
        path: '/page',
        loader: {
          handler: isServer ? () => 'server data' : clientHandler,
          dehydrate: true,
          hydrate: async ({ data }) => {
            started.resolve()
            await codecGate
            if (outcome === 'error') {
              throw new Error('obsolete codec failed')
            }
            if (outcome === 'redirect') {
              return redirect({ to: '/' })
            }
            return `${data}: hydrated`
          },
        },
      })
      return createTestRouter({
        routeTree: root.addChildren([page]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer,
      })
    }
    const server = build(true)
    const client = build(false)
    let hydration: Promise<void> | undefined
    let load: Promise<void> | undefined
    try {
      vi.stubGlobal('window', {
        $_TSR: await dehydrateToBootstrap(server, { routes: {} }),
      })
      hydration = hydrate(client)
      await started
      load = client.load({ sync: true })
      await hydration
      await load
      expect(clientHandler).toHaveBeenCalledTimes(1)
      expect(client.state.matches.at(-1)).toMatchObject({
        status: 'success',
        loaderData: 'client handler data',
      })
      codecGate.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(client.state.location.pathname).toBe('/page')
      expect(client.state.matches.at(-1)).toMatchObject({
        status: 'success',
        loaderData: 'client handler data',
      })
    } finally {
      codecGate.resolve()
      await hydration
      await load
      server.history.destroy()
      client.history.destroy()
    }
  },
)
