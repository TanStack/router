import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'

setFlagsFromString('--expose_gc')
const gc: () => void = runInNewContext('gc')

function createRouter(isServer: boolean) {
  const rootRoute = new BaseRootRoute({ loader: () => ({ root: true }) })
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
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
  const router = createRouter(false)

  await hydrate(router)
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
})
