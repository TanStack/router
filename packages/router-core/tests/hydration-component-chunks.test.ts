import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'
import type { TsrSsrGlobal } from '../src/ssr/types'

function settleWithin(promise: Promise<void>, ms: number) {
  return Promise.race([
    promise.then(() => 'hydrated' as const),
    new Promise<'waiting'>((resolve) =>
      setTimeout(() => resolve('waiting'), ms),
    ),
  ])
}

describe('hydration component chunks', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }

  beforeEach(() => {
    mockWindow = {}
    vi.stubGlobal('window', mockWindow)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function setup(configurePage: (route: any) => any) {
    const makeRouteTree = (configure: (route: any) => any) => {
      const rootRoute = new BaseRootRoute({})
      const pageRoute = configure(
        new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/page',
        }),
      )
      return rootRoute.addChildren([pageRoute])
    }
    const serverRouter = createTestRouter({
      routeTree: makeRouteTree((route) => route),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: true,
    })
    mockWindow.$_TSR = await dehydrateToBootstrap(serverRouter, {
      routes: {},
    })
    return createTestRouter({
      routeTree: makeRouteTree(configurePage),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
      isServer: false,
    })
  }

  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((r) => {
      resolve = r
    })
    return { promise, resolve }
  }

  test('starts a component chunk but does not wait for it', async () => {
    const chunk = deferred<void>()
    const preload = vi.fn(() => chunk.promise)
    const router = await setup((route) => {
      route.options.component = Object.assign(() => null, { preload })
      return route
    })

    expect(await settleWithin(hydrate(router), 50)).toBe('hydrated')
    expect(preload).toHaveBeenCalledTimes(1)
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      '__root__',
      '/page',
    ])
    chunk.resolve()
  })

  test('waits for lazy route options but not the component chunk they name', async () => {
    const lazyOptions = deferred<any>()
    const chunk = deferred<void>()
    const preload = vi.fn(() => chunk.promise)
    const router = await setup((route) => route.lazy(() => lazyOptions.promise))

    const hydration = hydrate(router)
    expect(await settleWithin(hydration, 50)).toBe('waiting')

    lazyOptions.resolve({
      options: { component: Object.assign(() => null, { preload }) },
    })
    expect(await settleWithin(hydration, 50)).toBe('hydrated')
    expect(preload).toHaveBeenCalledTimes(1)
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      '__root__',
      '/page',
    ])
    chunk.resolve()
  })

  test('commits the server matches when a component preload rejects', async () => {
    const onUnhandledRejection = vi.fn()
    process.on('unhandledRejection', onUnhandledRejection)
    try {
      const router = await setup((route) => {
        route.options.component = Object.assign(() => null, {
          preload: () => Promise.reject(new Error('chunk failed')),
        })
        return route
      })

      await hydrate(router)
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(router.state.matches.map((match) => match.status)).toEqual([
        'success',
        'success',
      ])
      expect(onUnhandledRejection).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })
})
