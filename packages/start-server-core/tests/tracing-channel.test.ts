// @vitest-environment node

import { AsyncLocalStorage } from 'node:async_hooks'
import { tracingChannel } from 'node:diagnostics_channel'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { createMiddleware } from '@tanstack/start-client-core'
import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
  redirect,
} from '@tanstack/router-core'
import { createStartHandler } from '../src/createStartHandler'
import { createServerEntry } from '../src/internal-request-response'
import type { TracingChannel } from 'node:diagnostics_channel'
import type { AnyRouter } from '@tanstack/router-core'

const startMocks = vi.hoisted(() => {
  process.env.TSS_SERVER_FN_BASE = '/_serverFn/'
  return {
    requestMiddleware: [] as Array<any>,
    serverFnHandler: undefined as undefined | (() => unknown),
    router: undefined as undefined | AnyRouter,
  }
})

vi.mock('#tanstack-start-entry', () => ({
  startInstance: {
    getOptions: () => ({ requestMiddleware: startMocks.requestMiddleware }),
  },
}))

vi.mock('#tanstack-router-entry', () => ({
  getRouter: () => startMocks.router,
}))

vi.mock('../src/server-functions-handler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/server-functions-handler')>()),
  handleServerAction: () => startMocks.serverFnHandler?.(),
}))

const channels = {
  request: tracingChannel<unknown, any>('@tanstack/start:request'),
  render: tracingChannel<unknown, any>('@tanstack/start:render'),
  loader: tracingChannel<unknown, any>('@tanstack/router:loader'),
}

type Span = { channel: string; name: string; parent?: string; ctx: any }

const store = new AsyncLocalStorage<string>()
const cleanups: Array<() => void> = []

/**
 * Records every traced operation, with the operation it ran inside.
 */
function record() {
  const spans: Array<Span> = []
  const events: Array<string> = []
  for (const [key, channel] of Object.entries(channels) as Array<
    [string, TracingChannel<unknown, any>]
  >) {
    const label = (ctx: any) =>
      key === 'render' ? 'render' : `${ctx.type} ${ctx.name ?? ctx.routeId}`
    channel.start.bindStore(store, (ctx) => {
      spans.push({
        channel: key,
        name: label(ctx),
        parent: store.getStore(),
        ctx,
      })
      return label(ctx)
    })
    const handlers = {
      start: (ctx: any) => events.push(`start ${label(ctx)}`),
      end: (ctx: any) => events.push(`end ${label(ctx)}`),
      asyncStart: () => {},
      asyncEnd: (ctx: any) => events.push(`asyncEnd ${label(ctx)}`),
      error: (ctx: any) => events.push(`error ${label(ctx)}`),
    }
    channel.subscribe(handlers)
    cleanups.push(() => {
      channel.unsubscribe(handlers)
      channel.start.unbindStore(store)
    })
  }

  return { spans, events }
}

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  startMocks.requestMiddleware = []
  startMocks.serverFnHandler = undefined
  startMocks.router = undefined
})

function makeRouter(routeOptions: Record<string, unknown>) {
  const rootRoute = new BaseRootRoute({})
  const route = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/items/$id',
    ...routeOptions,
  })
  const router = new RouterCore(
    {
      history: createMemoryHistory({ initialEntries: ['/'] }),
      routeTree: rootRoute.addChildren([route]),
    },
    () => ({
      createMutableStore: createNonReactiveMutableStore,
      createReadonlyStore: createNonReactiveReadonlyStore,
      batch: (fn: () => void) => fn(),
    }),
  )
  router.isServer = true
  startMocks.router = router

  return { router, route }
}

function fetch(path: string, init?: RequestInit) {
  const handler = createServerEntry({
    fetch: createStartHandler(() => new Response('<html></html>')),
  }).fetch

  return handler(new Request(`http://localhost${path}`, init), {})
}

describe('@tanstack/start:request', () => {
  it('nests middleware and the route handler', async () => {
    const { spans, events } = record()
    startMocks.requestMiddleware = [
      createMiddleware().server(function auth({ next }) {
        // Returning next() directly keeps the pipeline's promise identity.
        return next()
      }),
    ]
    const route = createMiddleware().server(async function routeMw({ next }) {
      return next()
    })
    makeRouter({
      server: {
        middleware: [route],
        handlers: { GET: () => new Response('ok') },
      },
    })

    const response = await fetch('/items/1')

    expect(await response.text()).toBe('ok')
    expect(spans.map(({ name, parent }) => [name, parent])).toEqual([
      ['middleware auth', undefined],
      ['middleware routeMw', 'middleware auth'],
      ['handler GET /items/$id', 'middleware routeMw'],
    ])
    const handler = spans[2]!.ctx
    expect(handler.request.url).toBe('http://localhost/items/1')
    expect(handler.ctx.params).toEqual({ id: '1' })
    expect(handler.result).toBeInstanceOf(Response)
    expect(events).not.toContainEqual(expect.stringMatching(/^error/))
  })

  it('publishes error for a throwing handler', async () => {
    const { events, spans } = record()
    const error = new Error('boom')
    makeRouter({
      server: {
        handlers: {
          GET: () => {
            throw error
          },
        },
      },
    })

    expect((await fetch('/items/1')).status).toBe(500)

    expect(events).toContain('error handler GET /items/$id')
    expect(spans[0]!.ctx.error).toBe(error)
  })

  it('does not publish error for a thrown redirect', async () => {
    const { events, spans } = record()
    startMocks.requestMiddleware = [
      createMiddleware().server(function guard() {
        throw redirect({ href: '/login' })
      }),
    ]
    makeRouter({ component: () => null })

    const response = await fetch('/items/1')

    expect(response.status).toBe(307)
    // A sync throw ends on `end`, like traceSync.
    expect(events).toEqual(['start middleware guard', 'end middleware guard'])
    expect(spans[0]!.ctx.result).toBeInstanceOf(Response)
  })

  it('traces a server function by id', async () => {
    const { spans } = record()
    startMocks.serverFnHandler = () => new Response('fn')

    const response = await fetch('/_serverFn/abc123', {
      headers: { 'x-tsr-serverFn': 'true' },
    })

    expect(await response.text()).toBe('fn')
    expect(spans.map((s) => s.name)).toContain('server_function abc123')
  })
})

describe('@tanstack/start:render', () => {
  it('wraps the document render, with loaders nested inside', async () => {
    const { spans, events } = record()
    const { route } = makeRouter({
      component: () => null,
      loader: async () => 'data',
    })

    const response = await fetch('/items/1')

    expect(response.status).toBe(200)
    const render = spans.find((s) => s.channel === 'render')!
    expect(render.ctx.request.url).toBe('http://localhost/items/1')
    expect(render.ctx.matchedRoutes.map((r: any) => r.id)).toContain(route.id)
    expect(render.ctx.router).toBe(startMocks.router)
    expect(spans.find((s) => s.channel === 'loader')!.parent).toBe('render')
    expect(events).toContain('asyncEnd render')
  })

  it('does not fire for server functions', async () => {
    const { spans } = record()
    startMocks.serverFnHandler = () => new Response('fn')

    await fetch('/_serverFn/abc123', { headers: { 'x-tsr-serverFn': 'true' } })

    expect(spans.some((s) => s.channel === 'render')).toBe(false)
  })
})

it('works without subscribers', async () => {
  expect(channels.request.hasSubscribers).toBe(false)
  startMocks.requestMiddleware = [
    createMiddleware().server(({ next }) => next()),
  ]
  makeRouter({ server: { handlers: { GET: () => new Response('ok') } } })

  expect(await (await fetch('/items/1')).text()).toBe('ok')
})
