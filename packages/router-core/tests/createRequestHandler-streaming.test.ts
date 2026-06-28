import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createRequestHandler } from '../src/ssr/createRequestHandler'
import { createTestRouter } from './routerTestUtils'
import type { AnyRouter } from '../src'

const HUMAN_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36'
const BOT_UA = 'Mozilla/5.0 compatible Googlebot/2.1'

function makeRequest(userAgent = HUMAN_UA, headers?: Record<string, string>) {
  return new Request('http://localhost/', {
    headers: {
      'user-agent': userAgent,
      ...headers,
    },
  })
}

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

describe('createRequestHandler streaming policy', () => {
  test('resolves streaming before router.load', async () => {
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
      request: makeRequest(HUMAN_UA),
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

  test('default human request streams render and leaves head off', async () => {
    const router = makeRouter()

    await createRequestHandler({
      request: makeRequest(HUMAN_UA),
      createRouter: () => router,
    })(async ({ router: requestRouter }) => {
      expect(requestRouter.serverSsr!.shouldStream('render')).toBe(true)
      expect(requestRouter.serverSsr!.shouldStream('head')).toBe(false)
      return new Response('ok')
    })
  })

  test('default bot request blocks render and leaves head off', async () => {
    const router = makeRouter()

    await createRequestHandler({
      request: makeRequest(BOT_UA),
      createRouter: () => router,
    })(async ({ router: requestRouter }) => {
      expect(requestRouter.serverSsr!.shouldStream('render')).toBe(false)
      expect(requestRouter.serverSsr!.shouldStream('head')).toBe(false)
      return new Response('ok')
    })
  })

  test('resolver can use request headers', async () => {
    const router = makeRouter()

    await createRequestHandler({
      request: makeRequest(HUMAN_UA, { 'x-streaming': 'none' }),
      createRouter: () => router,
      ssr: {
        streaming: ({ request }) => {
          if (request.headers.get('x-streaming') === 'none') {
            return { render: false }
          }
          return undefined
        },
      },
    })(async ({ router: requestRouter }) => {
      expect(requestRouter.serverSsr!.shouldStream('render')).toBe(false)
      expect(requestRouter.serverSsr!.shouldStream('head')).toBe(false)
      return new Response('ok')
    })
  })

  test('handler sees same policy that loader saw', async () => {
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
      request: makeRequest(HUMAN_UA),
      createRouter: () => router,
      ssr: {
        streaming: {
          render: true,
        },
      },
    })(async ({ router: requestRouter }) => {
      expect({
        render: requestRouter.serverSsr!.shouldStream('render'),
        head: requestRouter.serverSsr!.shouldStream('head'),
      }).toEqual(seenInLoader[0])
      return new Response('ok')
    })
  })
})
