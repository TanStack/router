// @vitest-environment node
import { afterAll, bench, describe, expect, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { hydrate } from '../src/ssr/client'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'
import type { AnyRoute } from '../src'
import type { ServerManifest } from '../src/manifest'

let benchmarkSink = 0

vi.stubGlobal('window', { origin: 'http://localhost' })
vi.stubGlobal('self', window)
vi.stubGlobal('document', { querySelector: () => null })
afterAll(() => vi.unstubAllGlobals())

for (const depth of [1, 6, 32]) {
  const rootRoute = new BaseRootRoute({})
  const routes: Array<AnyRoute> = [rootRoute]
  let parent: AnyRoute = rootRoute
  for (let index = 0; index < depth; index++) {
    const parentRoute = parent
    const route = new BaseRoute({
      getParentRoute: () => parentRoute,
      id: `_layout-${index}`,
    })
    parent.addChildren([route])
    routes.push(route)
    parent = route
  }
  const productRoute = new BaseRoute({
    getParentRoute: () => parent,
    path: '/products/$productId',
    loader: () => ({ productId: '42' }),
  })
  parent.addChildren([productRoute])
  routes.push(productRoute)

  const createRouter = (isServer: boolean) =>
    createTestRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/products/42'] }),
      isServer,
    })

  const serverRouter = createRouter(true)
  const manifest: ServerManifest = {
    routes: Object.fromEntries(
      routes.map((route, index) => [
        route.id,
        { preloads: [`/assets/route-${index}.js`] },
      ]),
    ),
  }
  const bootstrap = await dehydrateToBootstrap(serverRouter, manifest)
  serverRouter.history.destroy()
  window.$_TSR = bootstrap
  const clientRouter = createRouter(false)
  await hydrate(clientRouter)
  expect(clientRouter.ssr?.manifest).toEqual(manifest)
  expect(clientRouter.state.matches.at(-1)?.loaderData).toEqual({
    productId: '42',
  })
  clientRouter.history.destroy()

  describe(`SSR manifest with ${depth} pathless layouts`, () => {
    bench('load and dehydrate manifest assets', async () => {
      const router = createRouter(true)
      attachRouterServerSsrUtils({ router, manifest })
      try {
        await router.load()
        await router.serverSsr!.dehydrate()
        benchmarkSink =
          router.serverSsr!.takeInitialHydrationScriptTags()!.before[0]!
            .children!.length
      } finally {
        router.serverSsr!.cleanup()
        router.history.destroy()
      }
    })

    bench('hydrate manifest assets and loader data', async () => {
      window.$_TSR = { ...bootstrap }
      const router = createRouter(false)
      try {
        await hydrate(router)
        benchmarkSink = Object.keys(router.ssr!.manifest!.routes).length
      } finally {
        router.history.destroy()
      }
    })
  })
}

void benchmarkSink
