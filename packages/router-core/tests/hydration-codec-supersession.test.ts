import { createMemoryHistory } from '@tanstack/history'
import { afterEach, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'
import type { AnyRouteMatch } from '../src'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test.each(['direct', 'ordinary', 'loaderless'] as const)(
  'a superseding load separates a pending parent codec from its %s descendant chain',
  async (bridgeKind) => {
    const codecStarted = createControlledPromise<void>()
    const codecGate = createControlledPromise<void>()
    const clientParent = vi.fn(() => 'client parent')
    const clientMiddle = vi.fn(
      async ({
        parentMatchPromise,
      }: {
        parentMatchPromise: Promise<AnyRouteMatch>
      }) => {
        const parent = await parentMatchPromise
        return `${parent.loaderData}: middle`
      },
    )
    const clientChild = vi.fn(
      async ({
        parentMatchPromise,
      }: {
        parentMatchPromise: Promise<AnyRouteMatch>
      }) => {
        const parent = await parentMatchPromise
        return bridgeKind === 'loaderless'
          ? `${parent.routeId}: child`
          : `${parent.loaderData}: child`
      },
    )
    const build = (isServer: boolean) => {
      const root = new BaseRootRoute({})
      const parent = new BaseRoute({
        getParentRoute: () => root,
        path: '/parent',
        loader: {
          handler: isServer ? () => 'server parent' : clientParent,
          dehydrate: true,
          hydrate: async ({ data }) => {
            codecStarted.resolve()
            await codecGate
            return `${data}: hydrated`
          },
        },
      })
      const middle =
        bridgeKind === 'direct'
          ? undefined
          : new BaseRoute({
              getParentRoute: () => parent,
              path: '/middle',
              loader:
                bridgeKind === 'ordinary'
                  ? {
                      handler: isServer ? () => 'server middle' : clientMiddle,
                      dehydrate: false,
                    }
                  : undefined,
            })
      const child = new BaseRoute({
        getParentRoute: () => middle ?? parent,
        path: '/child',
        loader: {
          handler: isServer ? () => 'server child' : clientChild,
          dehydrate: false,
        },
      })
      return createTestRouter({
        routeTree: root.addChildren([
          parent.addChildren([middle ? middle.addChildren([child]) : child]),
        ]),
        history: createMemoryHistory({
          initialEntries: [
            bridgeKind === 'direct' ? '/parent/child' : '/parent/middle/child',
          ],
        }),
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
      await codecStarted
      await vi.waitFor(() => expect(clientChild).toHaveBeenCalledTimes(1))
      let completed = false
      load = client.load({ sync: true }).then(() => {
        completed = true
      })
      await hydration
      // A pending hydration transform cannot hold up the replacement load.
      await expect.poll(() => completed, { timeout: 500 }).toBe(true)
      expect(clientParent).toHaveBeenCalledTimes(1)
      expect(clientMiddle).toHaveBeenCalledTimes(
        bridgeKind === 'ordinary' ? 2 : 0,
      )
      expect(clientChild).toHaveBeenCalledTimes(
        bridgeKind === 'loaderless' ? 1 : 2,
      )
      const loaderData =
        bridgeKind === 'loaderless'
          ? '/parent/middle: child'
          : bridgeKind === 'ordinary'
            ? 'client parent: middle: child'
            : 'client parent: child'
      expect(client.state.matches.at(-1)).toMatchObject({
        status: 'success',
        loaderData,
      })
      codecGate.resolve()
      // Let the obsolete parent and dependent handlers complete privately.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(client.state.matches.at(-1)).toMatchObject({
        status: 'success',
        loaderData,
      })
    } finally {
      codecGate.resolve()
      await hydration
      await load
      client.clearCache()
      server.history.destroy()
      client.history.destroy()
    }
  },
)
