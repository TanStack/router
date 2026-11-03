import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'

function createFixture(isServer: boolean, pendingComponent: () => null) {
  const context = vi.fn(() => ({ source: 'client' }))
  const root = new BaseRootRoute({})
  const layout = new BaseRoute({
    getParentRoute: () => root,
    path: '/layout',
    ssr: false,
    context,
    notFoundComponent: () => null,
  })
  const lazy = vi.fn(async () => ({
    options: { id: layout.id, pendingComponent },
  }))
  layout.lazy(lazy)
  const known = new BaseRoute({
    getParentRoute: () => layout,
    path: '/known',
  })
  const router = createTestRouter({
    routeTree: root.addChildren([layout.addChildren([known])]),
    history: createMemoryHistory({ initialEntries: ['/layout/missing'] }),
    notFoundMode: 'fuzzy',
    isServer,
    scrollRestoration: false,
  })
  return { router, context, lazy }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('hydration waits for the lazy pending shell of a client-only fuzzy not-found route', async () => {
  const ready = createControlledPromise<void>()
  const started = createControlledPromise<void>()
  const preload = vi.fn(() => {
    started.resolve()
    return ready
  })
  const Pending = Object.assign(() => null, { preload })
  const server = createFixture(true, () => null)
  const client = createFixture(false, Pending)
  let hydration: Promise<void> | undefined
  let completed = false
  try {
    vi.stubGlobal('window', {
      $_TSR: await dehydrateToBootstrap(server.router, { routes: {} }),
    })
    expect(server.lazy).toHaveBeenCalledTimes(1)
    expect(server.context).not.toHaveBeenCalled()

    hydration = hydrate(client.router).then(() => {
      completed = true
    })
    // A reconstruction that skips the shell finishes instead of starting it.
    await Promise.race([started, hydration])
    expect(client.lazy).toHaveBeenCalledTimes(1)
    expect(preload).toHaveBeenCalledTimes(1)
    // Drain this task's microtasks while the component remains unavailable.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(completed).toBe(false)
    expect(client.context).not.toHaveBeenCalled()

    ready.resolve()
    await hydration

    expect(completed).toBe(true)
    expect(client.context).toHaveBeenCalledTimes(1)
    expect(client.router.state.matches.at(-1)).toMatchObject({
      routeId: '/layout',
      status: 'pending',
      context: { source: 'client' },
    })
    expect(client.router.state.resolvedLocation).toBeUndefined()
  } finally {
    ready.resolve()
    await hydration
    client.router.clearCache()
    client.router.history.destroy()
    server.router.clearCache()
    server.router.history.destroy()
  }
})
