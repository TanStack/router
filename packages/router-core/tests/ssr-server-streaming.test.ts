import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createRequestHandler } from '../src/ssr/createRequestHandler'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { createTestRouter } from './routerTestUtils'
import type { AnyRouter } from '../src'
import type { ResolvedSsrStreaming } from '../src/ssr/streaming'

function makeRouter(opts?: { onLoad?: (router: AnyRouter) => void }) {
  const rootRoute = new BaseRootRoute({})
  let router!: AnyRouter
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
    loader: () => {
      opts?.onLoad?.(router)
    },
  })

  router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
  })

  return router
}

describe('serverSsr streaming policy', () => {
  test('serverSsr exposes resolved streaming decisions', () => {
    const router = makeRouter()
    const streaming: ResolvedSsrStreaming = {
      render: true,
      head: false,
    }

    attachRouterServerSsrUtils({
      router,
      manifest: undefined,
      streaming,
    })

    expect(router.serverSsr!.shouldStream('render')).toBe(true)
    expect(router.serverSsr!.shouldStream('head')).toBe(false)
  })

  test('attach requires a resolved streaming policy', () => {
    const router = makeRouter()

    expect(() =>
      attachRouterServerSsrUtils({
        router,
        manifest: undefined,
      } as any),
    ).toThrow(/requires a resolved SSR streaming policy/)
  })

  test('serverSsr.shouldStream rejects unknown channels at runtime', () => {
    const router = makeRouter()

    attachRouterServerSsrUtils({
      router,
      manifest: undefined,
      streaming: {
        render: true,
        head: true,
      },
    })

    expect(() =>
      router.serverSsr!.shouldStream('future-channel' as any),
    ).toThrow('Unknown ssr.streaming channel "future-channel"')
  })

  test('streaming policy is available before router.load', async () => {
    const seenInLoader: Array<{ render: boolean; head: boolean }> = []
    const router = makeRouter({
      onLoad: (requestRouter) => {
        seenInLoader.push({
          render: requestRouter.serverSsr!.shouldStream('render'),
          head: requestRouter.serverSsr!.shouldStream('head'),
        })
      },
    })

    await createRequestHandler({
      request: new Request('http://localhost/'),
      createRouter: () => router,
      ssr: {
        streaming: {
          render: false,
          head: true,
        },
      },
    })(async () => new Response('ok'))

    expect(seenInLoader).toEqual([
      {
        render: false,
        head: true,
      },
    ])
  })

  test('cleanup does not mutate captured streaming decisions', () => {
    const router = makeRouter()
    const streaming: ResolvedSsrStreaming = {
      render: true,
      head: false,
    }

    attachRouterServerSsrUtils({
      router,
      manifest: undefined,
      streaming,
    })

    const captured = router.serverSsr!
    router.serverSsr!.cleanup()

    expect(captured.shouldStream('render')).toBe(true)
    expect(captured.shouldStream('head')).toBe(false)
  })
})
