// @vitest-environment node

import { afterAll, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import { createStartHandler } from '../src/createStartHandler'
import type { AnyRoute } from '@tanstack/router-core'

// The handler reads the basepath at module load, so it is set before import.
const mocks = vi.hoisted(() => {
  const previous = process.env.TSS_ROUTER_BASEPATH
  process.env.TSS_ROUTER_BASEPATH = '/app/'
  return { previous, routerRequests: 0 }
})

afterAll(() => {
  process.env.TSS_ROUTER_BASEPATH = mocks.previous
})

const rootRoute = new BaseRootRoute({})
const healthRoute = new BaseRoute({
  getParentRoute: () => rootRoute,
  path: '/api/health',
  server: { handlers: { GET: () => Response.json({ ok: true }) } },
})
const tree = rootRoute.addChildren([healthRoute]) as unknown as AnyRoute

vi.mock('#tanstack-start-api-route-tree', () => ({ apiRouteTree: tree }))
vi.mock('#tanstack-start-entry', () => ({ startInstance: undefined }))
vi.mock('#tanstack-router-entry', () => ({
  getRouter: () => {
    mocks.routerRequests++
    const router = new RouterCore(
      {
        history: createMemoryHistory({ initialEntries: ['/'] }),
        routeTree: tree,
        basepath: '/app',
      },
      () => ({
        createMutableStore: createNonReactiveMutableStore,
        createReadonlyStore: createNonReactiveReadonlyStore,
        batch: (fn: () => void) => fn(),
      }),
    )
    router.isServer = true
    return router
  },
}))

const handler = createStartHandler(() => new Response('page', { status: 599 }))
const fetch = (path: string) =>
  handler(
    new Request(`http://localhost${path}`, {
      headers: { accept: 'text/html' },
    }),
    undefined as any,
  )

describe('server-route fast path under a router basepath', () => {
  it('matches routes below the basepath without a Router', async () => {
    const res = await fetch('/app/api/health')

    expect(await res.json()).toEqual({ ok: true })
    expect(mocks.routerRequests).toBe(0)
  })

  it('leaves paths outside the basepath to the Router', async () => {
    // Whatever the Router then does with them is its own behaviour; the fast
    // path must not have answered.
    for (const path of ['/api/health', '/app', '/application/api/health']) {
      await fetch(path)
    }
    expect(mocks.routerRequests).toBe(3)
  })
})
