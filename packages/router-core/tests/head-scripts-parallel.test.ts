import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, onTestFinished, test, vi } from 'vitest'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
} from '../src'
import { projectLane } from '../src/load-client'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

const flush = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Builds a properly nested route chain of `count` routes where EVERY route
 * (including the root at index 0) receives `makeOptions(index)`. Returns the
 * route tree plus the flat list of routes in match order.
 */
function buildChain(
  count: number,
  makeOptions: (index: number) => Record<string, unknown> = () => ({}),
): { tree: any; routes: Array<any> } {
  const rootRoute = new BaseRootRoute(makeOptions(0) as any)
  const routes: Array<any> = [rootRoute]
  for (let index = 1; index < count; index++) {
    const parent = routes[index - 1]!
    routes.push(
      new BaseRoute({
        getParentRoute: () => parent,
        path: `/r${index}`,
        ...makeOptions(index),
      } as any),
    )
  }
  let tree: any = routes[count - 1]!
  for (let index = count - 2; index >= 0; index--) {
    tree = routes[index]!.addChildren([tree]) as any
  }
  return { tree, routes }
}

function makeMatch(
  routeId: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: routeId,
    routeId,
    status: 'success',
    params: {},
    loaderData: undefined,
    _notFound: undefined,
    ...extra,
  }
}

function makeLane(matches: Array<Record<string, unknown>>): [unknown, unknown] {
  return [{ pathname: '/', search: {} } as any, matches as any]
}

describe('client projectLane evaluates head/scripts across matches in parallel', () => {
  test('applies results in route order even when later matches resolve first', async () => {
    const rootHead = createControlledPromise<any>()
    const parentHead = createControlledPromise<any>()
    const childHead = createControlledPromise<any>()
    const heads = [rootHead, parentHead, childHead]
    const invocationOrder: Array<number> = []

    const { tree, routes } = buildChain(3, (index) => ({
      head: () => {
        invocationOrder.push(index)
        return heads[index]!
      },
    }))
    const router = createTestRouter({
      routeTree: tree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const matches = routes.map((route) => makeMatch(route.id))
    const done = projectLane(
      router,
      makeLane(matches) as any,
      new AbortController().signal,
    )

    // All callbacks were invoked synchronously in route order before any
    // result was awaited.
    expect(invocationOrder).toEqual([0, 1, 2])

    // The later matches settle first.
    childHead.resolve({ meta: [{ name: 'child' }] })
    parentHead.resolve({ meta: [{ name: 'parent' }] })
    await flush()

    // Route-order application means nothing may be applied until the first
    // match's head settles.
    expect(matches.map((match) => match.meta)).toEqual([
      undefined,
      undefined,
      undefined,
    ])

    rootHead.resolve({ meta: [{ name: 'root' }] })
    await done

    expect(matches.map((match) => match.meta)).toEqual([
      [{ name: 'root' }],
      [{ name: 'parent' }],
      [{ name: 'child' }],
    ])
  })

  test('stops invoking callbacks at the existing break boundary (error status)', async () => {
    const rootHead = vi.fn(() => ({ meta: [] }))
    const layoutHead = vi.fn(() => Promise.resolve({ meta: [] }))
    const hiddenLeafHead = vi.fn(() => ({ meta: [] }))

    const rootRoute = new BaseRootRoute({ head: rootHead })
    const layoutRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/layout',
      head: layoutHead,
    })
    const leafRoute = new BaseRoute({
      getParentRoute: () => layoutRoute,
      path: '/leaf',
      head: hiddenLeafHead,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([layoutRoute.addChildren([leafRoute])]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await projectLane(
      router,
      makeLane([
        makeMatch(rootRoute.id),
        makeMatch(layoutRoute.id, { status: 'error', error: new Error('x') }),
        makeMatch(leafRoute.id),
      ]) as any,
      new AbortController().signal,
    )

    expect(rootHead).toHaveBeenCalledTimes(1)
    expect(layoutHead).toHaveBeenCalledTimes(1)
    expect(hiddenLeafHead).not.toHaveBeenCalled()
  })

  test('does not invoke callbacks past a _notFound break boundary', async () => {
    const hiddenHead = vi.fn(() => ({ meta: [{ name: 'hidden' }] }))
    const rootRoute = new BaseRootRoute({
      head: () => ({ meta: [{ name: 'root' }] }),
    })
    const leafRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/leaf',
      head: hiddenHead,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([leafRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const matches = [
      makeMatch(rootRoute.id, { _notFound: true }),
      makeMatch(leafRoute.id),
    ]
    await projectLane(
      router,
      makeLane(matches) as any,
      new AbortController().signal,
    )

    expect(hiddenHead).not.toHaveBeenCalled()
    expect(matches[0]!.meta).toEqual([{ name: 'root' }])
  })

  test('surfaces errors deterministically in route order and keeps rendering later matches', async () => {
    const errorRoot = new Error('root head failed')
    const errorParent = new Error('parent head failed')
    const rootHead = createControlledPromise<any>()
    const parentHead = createControlledPromise<any>()
    const childHead = vi.fn(() =>
      Promise.resolve({ meta: [{ name: 'child' }] }),
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => consoleError.mockRestore())

    const heads = [rootHead, parentHead]
    const { tree, routes } = buildChain(3, (index) =>
      index < 2 ? { head: () => heads[index] } : { head: childHead },
    )
    const router = createTestRouter({
      routeTree: tree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const matches = routes.map((route) => makeMatch(route.id))
    const done = projectLane(
      router,
      makeLane(matches) as any,
      new AbortController().signal,
    )
    // The second match rejects first; the first match rejects later. The
    // logged errors must still surface in route order.
    parentHead.reject(errorParent)
    await flush()
    rootHead.reject(errorRoot)

    await done

    expect(consoleError.mock.calls.map((call) => call[0])).toEqual([
      errorRoot,
      errorParent,
    ])
    // A failed head must not stop later matches from being projected.
    expect(childHead).toHaveBeenCalledTimes(1)
    expect(matches[2]!.meta).toEqual([{ name: 'child' }])
    expect(matches[0]!.meta).toBeUndefined()
    expect(matches[1]!.meta).toBeUndefined()
  })

  test('handles synchronous throws like rejections without breaking the lane', async () => {
    const syncError = new Error('sync head failure')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => consoleError.mockRestore())
    const childHead = vi.fn(() => ({ meta: [{ name: 'child' }] }))

    const rootRoute = new BaseRootRoute({
      head: () => {
        throw syncError
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/child',
      head: childHead,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([childRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const matches = [makeMatch(rootRoute.id), makeMatch(childRoute.id)]
    await projectLane(
      router,
      makeLane(matches) as any,
      new AbortController().signal,
    )

    expect(consoleError).toHaveBeenCalledWith(syncError)
    expect(childHead).toHaveBeenCalledTimes(1)
    expect(matches[1]!.meta).toEqual([{ name: 'child' }])
  })

  test('breaks silently when aborted mid-flight and emits no unhandled rejection', async () => {
    const unhandled: Array<unknown> = []
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)
    onTestFinished(async () => {
      process.off('unhandledRejection', onUnhandled)
      await flush(10)
      expect(unhandled).toEqual([])
    })

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => consoleError.mockRestore())

    const rootHead = createControlledPromise<any>()
    const childHead = createControlledPromise<any>()

    const rootRoute = new BaseRootRoute({ head: () => rootHead })
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/child',
      head: () => childHead,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([childRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const controller = new AbortController()
    const matches = [makeMatch(rootRoute.id), makeMatch(childRoute.id)]
    const done = projectLane(router, makeLane(matches) as any, controller.signal)
    controller.abort()
    // The child head rejects after abort; its rejection must stay handled.
    await flush()
    childHead.reject(new Error('child failed late'))
    await done

    // The still-pending root head and the rejected child head must
    // never surface anywhere.
    consoleError.mockClear()
    await flush(20)
    expect(consoleError).not.toHaveBeenCalled()

    rootHead.resolve({ meta: [] })
    expect(unhandled).toEqual([])
  })

  test('N delayed heads settle in ~max, not sum, of their durations', async () => {
    const delay = 80
    const count = 4

    const { tree, routes } = buildChain(count, () => ({
      head: () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ meta: [{ name: 'delayed' }] }), delay),
        ),
    }))
    void routes
    const router = createTestRouter({
      routeTree: tree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const matches = Array.from({ length: count }, (_, index) =>
      makeMatch(routes[index]!.id),
    )
    const started = performance.now()
    await projectLane(
      router,
      makeLane(matches) as any,
      new AbortController().signal,
    )
    const elapsed = performance.now() - started

    // Sequential evaluation would take ~sum (320ms); parallel evaluation is
    // bounded by the slowest single head (~80ms).
    expect(elapsed).toBeLessThan(delay * (count - 1))
    for (const match of matches) {
      expect(match.meta).toEqual([{ name: 'delayed' }])
    }
  })
})

describe('server projectLane evaluates head/scripts/headers across matches in parallel', () => {
  function setupServerRouter(delays: Array<number>) {
    return buildChain(delays.length + 1, (index) => ({
      head: () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                meta: [{ name: `s${index}` }],
                scripts: [{ children: `s${index}` }],
              }),
            delays[index - 1]!,
          ),
        ),
      scripts: () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve([{ children: `scripts-${index}` }]),
            delays[index - 1]!,
          ),
        ),
      headers: () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ 'x-lane': String(index) }),
            delays[index - 1] ?? 0,
          ),
        ),
    }))
  }

  test('applies head, scripts, and headers per match when later matches resolve first', async () => {
    // r1 is slow (120ms) and r2 is fast (20ms). Sequential code would take
    // sum (~140ms); parallel takes ~max (~120ms).
    const { tree, routes } = setupServerRouter([120, 20])
    const router = createTestRouter({
      routeTree: tree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })

    const started = performance.now()
    const response = await loadServerResponse(router, '/r1/r2')
    const elapsed = performance.now() - started

    expect(response.status).toBe(200)
    const matches = router.state.matches
    const first = matches.find((match) => match.routeId === routes[1]!.id)!
    const last = matches.find((match) => match.routeId === routes[2]!.id)!
    expect(first.meta).toEqual([{ name: 's1' }])
    expect(first.headScripts).toEqual([{ children: 's1' }])
    expect(first.scripts).toEqual([{ children: 'scripts-1' }])
    expect(first.headers).toEqual({ 'x-lane': '1' })
    expect(last.meta).toEqual([{ name: 's2' }])
    expect(last.headers).toEqual({ 'x-lane': '2' })

    // Parallel evaluation: bounded by the slowest head (~max), not the sum.
    expect(elapsed).toBeLessThan(220)
  })

  test('respects the ssr:false break boundary on the server', async () => {
    const hiddenHead = vi.fn(() => ({ meta: [] }))
    const rootRoute = new BaseRootRoute({
      head: () => ({ meta: [{ name: 'root' }] }),
    })
    const shellRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/shell',
      ssr: false,
    })
    const innerRoute = new BaseRoute({
      getParentRoute: () => shellRoute,
      path: '/inner',
      head: hiddenHead,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([shellRoute.addChildren([innerRoute])]),
      history: createMemoryHistory({ initialEntries: ['/shell'] }),
      isServer: true,
    })

    const response = await loadServerResponse(router, '/shell')
    expect(response.status).toBe(200)
    expect(hiddenHead).not.toHaveBeenCalled()
  })

  test('logs head failures in route order and still renders a 200', async () => {
    const errorRoot = new Error('server root head failed')
    const errorChild = new Error('server child head failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => consoleError.mockRestore())

    const rootHead = createControlledPromise<any>()
    const childHead = createControlledPromise<any>()
    const rootRoute = new BaseRootRoute({ head: () => rootHead })
    const childRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/c',
      head: () => childHead,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([childRoute]),
      history: createMemoryHistory({ initialEntries: ['/c'] }),
      isServer: true,
    })

    const responsePromise = loadServerResponse(router, '/c')
    // The child rejects first; route-order surfacing must log the root error
    // first regardless.
    childHead.reject(errorChild)
    await flush(10)
    rootHead.reject(errorRoot)

    const response = await responsePromise
    expect(response.status).toBe(200)
    expect(consoleError.mock.calls.map((call) => call[0])).toEqual([
      errorRoot,
      errorChild,
    ])
  })
})
