// @vitest-environment node

import { AsyncLocalStorage } from 'node:async_hooks'
import { tracingChannel } from 'node:diagnostics_channel'
import { afterEach, describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, notFound, redirect } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'
import type { LoaderTraceContext } from '../src/ssr/server'

const channel = tracingChannel<unknown, LoaderTraceContext>(
  '@tanstack/router:loader',
)

type Event = [name: string, type: string, routeId: string]

function record() {
  const events: Array<Event> = []
  const contexts: Array<LoaderTraceContext> = []
  const push = (name: string) => (ctx: LoaderTraceContext) => {
    events.push([name, ctx.type, ctx.routeId])
    if (name === 'start') {
      contexts.push(ctx)
    }
  }
  const handlers = {
    start: push('start'),
    end: push('end'),
    asyncStart: push('asyncStart'),
    asyncEnd: push('asyncEnd'),
    error: push('error'),
  }
  channel.subscribe(handlers)
  cleanup = () => channel.unsubscribe(handlers)

  return { events, contexts }
}

let cleanup: (() => void) | undefined

afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

function createRouter(routeOptions: Record<string, unknown>) {
  const rootRoute = new BaseRootRoute({})
  const route = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/foo',
    ...routeOptions,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory(),
    isServer: true,
  })

  return { router, route }
}

describe('@tanstack/router:loader', () => {
  test('traces beforeLoad and loader with their match', async () => {
    const { events, contexts } = record()
    const { router, route } = createRouter({
      beforeLoad: () => ({ user: 'a' }),
      loader: async () => 'data',
    })

    expect((await loadServerResponse(router, '/foo')).status).toBe(200)

    expect(events.filter((e) => e[2] === route.id)).toEqual([
      ['start', 'beforeLoad', route.id],
      ['end', 'beforeLoad', route.id],
      ['start', 'loader', route.id],
      ['end', 'loader', route.id],
      ['asyncStart', 'loader', route.id],
      ['asyncEnd', 'loader', route.id],
    ])
    const [beforeLoad, loader] = contexts.filter((c) => c.routeId === route.id)
    expect(beforeLoad!.result).toEqual({ user: 'a' })
    expect(loader!.result).toBe('data')
    expect(loader!.match.routeId).toBe(route.id)
  })

  test('runs loaders inside stores bound to the start channel', async () => {
    record()
    const store = new AsyncLocalStorage<string>()
    channel.start.bindStore(store, (ctx) => `${ctx.type}:${ctx.routeId}`)
    let seen: string | undefined
    const { router, route } = createRouter({
      loader: async () => {
        await Promise.resolve()
        seen = store.getStore()
      },
    })

    try {
      await loadServerResponse(router, '/foo')
    } finally {
      channel.start.unbindStore(store)
    }

    expect(seen).toBe(`loader:${route.id}`)
  })

  test('publishes error for a thrown error', async () => {
    const { events, contexts } = record()
    const error = new Error('boom')
    const { router, route } = createRouter({
      loader: async () => {
        throw error
      },
    })

    expect((await loadServerResponse(router, '/foo')).status).toBe(500)

    expect(events).toContainEqual(['error', 'loader', route.id])
    expect(contexts.find((c) => c.routeId === route.id)!.error).toBe(error)
  })

  test('treats redirect and notFound as results, not errors', async () => {
    const { events } = record()
    const { router, route } = createRouter({
      beforeLoad: () => {
        throw redirect({ href: '/elsewhere' })
      },
    })
    await loadServerResponse(router, '/foo')

    const notFoundRouter = createRouter({
      loader: () => {
        throw notFound()
      },
    })
    await loadServerResponse(notFoundRouter.router, '/foo')

    expect(events.some(([name]) => name === 'error')).toBe(false)
    expect(events).toContainEqual(['end', 'beforeLoad', route.id])
    expect(events).toContainEqual(['end', 'loader', notFoundRouter.route.id])
  })

  test('does not trace without subscribers', async () => {
    expect(channel.hasSubscribers).toBe(false)
    const { router } = createRouter({ loader: () => 'data' })

    expect((await loadServerResponse(router, '/foo')).status).toBe(200)
  })
})
