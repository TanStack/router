// @vitest-environment node

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  createMiddleware,
  getGlobalStartContext,
  getRouterInstance,
} from '@tanstack/start-client-core'
import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import { createStartHandler } from '../src/createStartHandler'
import type { AnyRoute } from '@tanstack/router-core'

const mocks = vi.hoisted(() => {
  const previousServerFnBase = process.env.TSS_SERVER_FN_BASE
  process.env.TSS_SERVER_FN_BASE = '/_serverFn/'
  return {
    previousServerFnBase,
    apiTree: undefined as AnyRoute | undefined,
    routerTree: undefined as AnyRoute | undefined,
    startOptions: undefined as undefined | Record<string, unknown>,
    routerRequests: 0,
  }
})

vi.mock('#tanstack-start-api-route-tree', () => ({
  get apiRouteTree() {
    return mocks.apiTree
  },
}))

vi.mock('#tanstack-start-entry', () => ({
  get startInstance() {
    return mocks.startOptions
      ? { getOptions: () => mocks.startOptions }
      : undefined
  },
}))

vi.mock('#tanstack-router-entry', () => ({
  getRouter: () => {
    mocks.routerRequests++
    return makeRouter(mocks.routerTree!)
  },
}))

afterAll(() => {
  process.env.TSS_SERVER_FN_BASE = mocks.previousServerFnBase
})

const calls: Array<string> = []

beforeEach(() => {
  calls.length = 0
  mocks.startOptions = undefined
  mocks.routerRequests = 0
})

function makeTree(opts: {
  parentServer?: any
  routeServer?: any
  params?: any
}) {
  const rootRoute = new BaseRootRoute({})
  const apiRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/api',
    server: opts.parentServer,
  })
  const userRoute = new BaseRoute({
    getParentRoute: () => apiRoute,
    path: '/users/$id',
    params: opts.params,
    server: opts.routeServer,
  })
  return rootRoute.addChildren([
    apiRoute.addChildren([userRoute]),
  ]) as unknown as AnyRoute
}

// The Router path sees the same routes, so a miss renders the "page".
function makeRouter(routeTree: AnyRoute) {
  const router = new RouterCore(
    {
      history: createMemoryHistory({ initialEntries: ['/'] }),
      routeTree,
    },
    () => ({
      createMutableStore: createNonReactiveMutableStore,
      createReadonlyStore: createNonReactiveReadonlyStore,
      batch: (fn: () => void) => fn(),
    }),
  )
  router.isServer = true
  return router
}

function makeHandler(tree: AnyRoute, startOptions?: Record<string, unknown>) {
  mocks.apiTree = tree
  mocks.routerTree = tree
  mocks.startOptions = startOptions
  return createStartHandler(() => new Response('page', { status: 599 }))
}

const fetch = (
  handler: ReturnType<typeof createStartHandler>,
  path: string,
  init?: RequestInit,
) =>
  handler(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { accept: 'text/html', ...init?.headers },
    }),
    undefined as any,
  )

describe('server-route fast path', () => {
  it('dispatches an exact match with params without building a Router', async () => {
    const handler = makeHandler(
      makeTree({
        routeServer: {
          handlers: {
            GET: ({ params }: any) => Response.json({ id: params.id }),
          },
        },
      }),
    )

    const res = await fetch(handler, '/api/users/42?x=1')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: '42' })
    expect(mocks.routerRequests).toBe(0)
  })

  it('takes the Router path for unmatched, fuzzy, and method-less requests', async () => {
    const handler = makeHandler(
      makeTree({
        routeServer: { handlers: { GET: () => new Response('ok') } },
      }),
    )

    for (const [path, init] of [
      ['/nope', undefined],
      ['/api/users/42/extra', undefined],
      ['/api/users/42', { method: 'POST' }],
      ['/api', undefined],
    ] as const) {
      const res = await fetch(handler, path, init)
      expect(res.status).toBe(599)
    }
    expect(mocks.routerRequests).toBe(4)
  })

  it('takes the Router path when no API tree was built', async () => {
    const handler = makeHandler(
      makeTree({
        routeServer: { handlers: { GET: () => new Response('ok') } },
      }),
    )
    mocks.apiTree = undefined

    const res = await fetch(handler, '/api/users/1')

    expect(await res.text()).toBe('ok')
    expect(mocks.routerRequests).toBe(1)
  })

  it('serves HEAD from GET with the same headers and no body', async () => {
    const handler = makeHandler(
      makeTree({
        routeServer: {
          handlers: {
            GET: () => new Response('body', { headers: { 'x-a': '1' } }),
          },
        },
      }),
    )

    const res = await fetch(handler, '/api/users/1', { method: 'HEAD' })

    expect(res.status).toBe(200)
    expect(res.headers.get('x-a')).toBe('1')
    expect(res.body).toBeNull()
    expect(mocks.routerRequests).toBe(0)
  })

  it('uses ANY when no method handler exists', async () => {
    const handler = makeHandler(
      makeTree({
        routeServer: { handlers: { ANY: () => new Response('any') } },
      }),
    )

    const res = await fetch(handler, '/api/users/1', { method: 'DELETE' })

    expect(await res.text()).toBe('any')
    expect(mocks.routerRequests).toBe(0)
  })

  it('runs global, parent, route, and handler middleware in order and merges context', async () => {
    const mw = (name: string) =>
      createMiddleware({ type: 'request' }).server(({ next }) => {
        calls.push(name)
        return next({ context: { [name]: true } })
      })
    const handler = makeHandler(
      makeTree({
        parentServer: { middleware: [mw('parent')] },
        routeServer: {
          middleware: [mw('route')],
          handlers: {
            GET: {
              middleware: [mw('handler')],
              handler: ({ context }: any) => {
                calls.push('fn')
                return Response.json(context)
              },
            },
          },
        },
      }),
      { requestMiddleware: [mw('global')] },
    )

    const res = await fetch(handler, '/api/users/1')

    expect(calls).toEqual(['global', 'parent', 'route', 'handler', 'fn'])
    expect(await res.json()).toEqual({
      global: true,
      parent: true,
      route: true,
      handler: true,
    })
    expect(mocks.routerRequests).toBe(0)
  })

  it('does not rerun route middleware that already ran as global middleware', async () => {
    const shared = createMiddleware({ type: 'request' }).server(({ next }) => {
      calls.push('shared')
      return next()
    })
    const handler = makeHandler(
      makeTree({
        parentServer: { middleware: [shared] },
        routeServer: {
          middleware: [shared],
          handlers: { GET: () => new Response() },
        },
      }),
      { requestMiddleware: [shared] },
    )

    await fetch(handler, '/api/users/1')

    expect(calls).toEqual(['shared'])
  })

  it('runs route middleware and handlers inside the Start request context', async () => {
    const handler = makeHandler(
      makeTree({
        routeServer: {
          middleware: [
            createMiddleware({ type: 'request' }).server(({ next }) =>
              next({ context: { seenGlobal: getGlobalStartContext() } }),
            ),
          ],
          handlers: {
            GET: async ({ context }: any) =>
              Response.json({
                ...context,
                hasRouter: !!(await getRouterInstance()),
              }),
          },
        },
      }),
      {
        requestMiddleware: [
          createMiddleware({ type: 'request' }).server(({ next }) =>
            next({ context: { fromGlobal: 1 } }),
          ),
        ],
      },
    )

    const res = await fetch(handler, '/api/users/1')

    expect(await res.json()).toEqual({
      fromGlobal: 1,
      seenGlobal: { fromGlobal: 1 },
      hasRouter: true,
    })
    // Only the handler's explicit getRouterInstance() built one.
    expect(mocks.routerRequests).toBe(1)
  })

  it('applies params.parse before the handler', async () => {
    const handler = makeHandler(
      makeTree({
        params: { parse: (p: any) => ({ id: Number(p.id) }) },
        routeServer: {
          handlers: { GET: ({ params }: any) => Response.json(params) },
        },
      }),
    )

    const res = await fetch(handler, '/api/users/7')

    expect(await res.json()).toEqual({ id: 7 })
  })
})
