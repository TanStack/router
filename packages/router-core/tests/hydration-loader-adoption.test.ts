import { createMemoryHistory } from '@tanstack/history'
import { afterEach, expect, test, vi } from 'vitest'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
} from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'
import type { AnyRouteMatch } from '../src'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('a superseding load preserves parent data for adopted ordinary hydration loaders', async () => {
  const parentStarted = createControlledPromise<void>()
  const childStarted = createControlledPromise<void>()
  const parentGate = createControlledPromise<void>()
  const signals: Array<AbortSignal> = []
  const clientParent = vi.fn(
    async ({ abortController }: { abortController: AbortController }) => {
      signals.push(abortController.signal)
      parentStarted.resolve()
      await parentGate
      return 'client parent'
    },
  )
  const clientChild = vi.fn(
    async ({
      parentMatchPromise,
      abortController,
    }: {
      parentMatchPromise: Promise<AnyRouteMatch>
      abortController: AbortController
    }) => {
      signals.push(abortController.signal)
      childStarted.resolve()
      const parent = await parentMatchPromise
      return `${parent.loaderData}: child`
    },
  )
  const build = (isServer: boolean) => {
    const root = new BaseRootRoute({})
    const parent = new BaseRoute({
      getParentRoute: () => root,
      path: '/parent',
      loader: {
        handler: isServer ? () => 'server parent' : clientParent,
        dehydrate: false,
      },
    })
    const child = new BaseRoute({
      getParentRoute: () => parent,
      path: '/child',
      loader: {
        handler: isServer ? () => 'server child' : clientChild,
        dehydrate: false,
      },
    })
    const other = new BaseRoute({
      getParentRoute: () => root,
      path: '/other',
    })
    return createTestRouter({
      routeTree: root.addChildren([parent.addChildren([child]), other]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
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
    await parentStarted
    await childStarted
    load = client.load({ sync: true })
    await hydration
    // Allow the replacement to adopt both generations while the parent waits.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(clientParent).toHaveBeenCalledTimes(1)
    expect(clientChild).toHaveBeenCalledTimes(1)
    expect(signals).toHaveLength(2)
    expect(signals.map((signal) => signal.aborted)).toEqual([false, false])

    parentGate.resolve()
    await load

    expect(clientParent).toHaveBeenCalledTimes(1)
    expect(clientChild).toHaveBeenCalledTimes(1)
    expect(signals.map((signal) => signal.aborted)).toEqual([false, false])
    expect(client.state.matches[1]).toMatchObject({
      status: 'success',
      loaderData: 'client parent',
    })
    expect(client.state.matches.at(-1)).toMatchObject({
      status: 'success',
      loaderData: 'client parent: child',
    })

    await client.navigate({ to: '/other' })
    client.clearCache()
    expect(client.state.location.pathname).toBe('/other')
    expect(signals.map((signal) => signal.aborted)).toEqual([true, true])
  } finally {
    parentGate.resolve()
    await hydration
    await load
    client.clearCache()
    client.history.destroy()
    server.history.destroy()
  }
})

test.each(['error', 'notFound'] as const)(
  'a superseding load preserves a parent %s for adopted ordinary hydration loaders',
  async (kind) => {
    const parentStarted = createControlledPromise<void>()
    const childStarted = createControlledPromise<void>()
    const parentGate = createControlledPromise<void>()
    const failure =
      kind === 'error' ? new Error('Parent loader failed') : notFound()
    const onError = vi.fn()
    const readParent = vi.fn((match: AnyRouteMatch) => ({
      status: match.status,
      error: match.error,
    }))
    const clientParent = vi.fn(async () => {
      parentStarted.resolve()
      await parentGate
      throw failure
    })
    const clientChild = vi.fn(
      async ({
        parentMatchPromise,
      }: {
        parentMatchPromise: Promise<AnyRouteMatch>
      }) => {
        childStarted.resolve()
        const parent = readParent(await parentMatchPromise)
        return `child after parent ${parent.status}`
      },
    )
    const build = (isServer: boolean) => {
      const root = new BaseRootRoute({})
      const parent = new BaseRoute({
        getParentRoute: () => root,
        path: '/parent',
        errorComponent: () => null,
        notFoundComponent: () => null,
        onError: isServer ? undefined : onError,
        loader: {
          handler: isServer ? () => 'server parent' : clientParent,
          dehydrate: false,
        },
      })
      const child = new BaseRoute({
        getParentRoute: () => parent,
        path: '/child',
        loader: {
          handler: isServer ? () => 'server child' : clientChild,
          dehydrate: false,
        },
      })
      return createTestRouter({
        routeTree: root.addChildren([parent.addChildren([child])]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
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
      await parentStarted
      await childStarted
      load = client.load({ sync: true })
      await hydration
      // Both ordinary generations transfer before the parent fails.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(clientParent).toHaveBeenCalledTimes(1)
      expect(clientChild).toHaveBeenCalledTimes(1)

      parentGate.resolve()
      await load

      expect(clientParent).toHaveBeenCalledTimes(1)
      expect(clientChild).toHaveBeenCalledTimes(1)
      expect(readParent).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ status: kind, error: failure }),
      )
      expect(onError).toHaveBeenCalledTimes(kind === 'error' ? 1 : 0)
      if (kind === 'error') {
        expect(onError).toHaveBeenCalledWith(failure)
      }
      expect(client.state.matches[1]).toMatchObject({
        status: kind,
        error: failure,
      })
      expect(client.state.matches.at(-1)).toMatchObject({
        loaderData: `child after parent ${kind}`,
      })
    } finally {
      parentGate.resolve()
      await hydration
      await load
      client.clearCache()
      client.history.destroy()
      server.history.destroy()
    }
  },
)
