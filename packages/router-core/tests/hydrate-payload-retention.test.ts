import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'

setFlagsFromString('--expose_gc')
const gc: () => void = runInNewContext('gc')

function createRouter(
  isServer: boolean,
  observeNavigate?: (navigate: object) => void,
) {
  const rootRoute = new BaseRootRoute({ loader: () => ({ root: true }) })
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    context: ({ navigate }) => {
      observeNavigate?.(navigate)
      return {}
    },
    loader: {
      handler: () => ({ index: true }),
      dehydrate: ({ data }) => [data.index],
      hydrate: ({ data }) => ({ index: data[0]! }),
    },
  })
  return createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer,
  })
}

test('hydration does not keep the dehydrated matches alive once the bootstrap data is removed', async () => {
  window.$_TSR = await dehydrateToBootstrap(createRouter(true), { routes: {} })
  const payload = new WeakRef(window.$_TSR.router!.matches)
  let navigate: WeakRef<object> | undefined
  const router = createRouter(false, (callback) => {
    navigate = new WeakRef(callback)
  })

  await hydrate(router)
  expect(navigate).toBeDefined()
  // The bootstrap script removes its data once the page hydrated and the
  // stream ended.
  window.$_TSR!.h()
  window.$_TSR!.e()
  delete window.$_TSR
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve))
    gc()
  }

  expect(router.state.matches.map((match) => match.loaderData)).toEqual([
    { root: true },
    { index: true },
  ])
  expect(payload.deref()).toBeUndefined()
  expect(navigate!.deref()).toBeUndefined()
})

test.each([false, true])(
  'releases the wire data of a detached pending loader that self-aborts: %s',
  async (selfAbort) => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let wire: WeakRef<object> | undefined
    const build = (isServer: boolean) => {
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: {
          handler: () => 'parent data',
          dehydrate: true,
          hydrate: () => {
            throw new Error('parent transform failed')
          },
        },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: {
          handler: () => ({ source: isServer ? 'server' : 'client' }),
          dehydrate: ({ data }) => ({ wire: data.source }),
          hydrate: ({ data, abortController }) => {
            wire = new WeakRef(data)
            if (selfAbort) {
              abortController.abort()
            }
            // Application code retains neither the wire data nor this promise.
            return new Promise<{ source: string }>(() => {})
          },
        },
      })
      const elsewhereRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/elsewhere',
      })
      return createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
          elsewhereRoute,
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer,
      })
    }
    const router = build(false)
    try {
      window.$_TSR = await dehydrateToBootstrap(build(true), { routes: {} })
      await hydrate(router)
      window.$_TSR!.h()
      window.$_TSR!.e()
      delete window.$_TSR

      await router.load()
      expect(router.state.matches.at(-1)?.loaderData).toEqual({
        source: 'client',
      })
      expect(wire).toBeDefined()
      // The diagnostic observer must not own the failure's native stack,
      // which can itself retain the callback arguments and aborted signals.
      warning.mockClear()
      for (let i = 0; i < 4; i++) {
        await new Promise((resolve) => setTimeout(resolve))
        gc()
      }
      expect(wire!.deref()).toBeUndefined()
    } finally {
      await router.navigate({ to: '/elsewhere' })
      router.clearCache()
      router.history.destroy()
      delete window.$_TSR
      warning.mockRestore()
    }
  },
)
