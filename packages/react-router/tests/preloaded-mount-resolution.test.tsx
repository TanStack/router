import { afterEach, beforeEach, test, vi } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory } from '@tanstack/history'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

/**
 * A load that settles before RouterProvider mounts (or completes within the
 * mount effect's batch) gives the Transitioner no isLoading flip to observe.
 * The router status must still resolve to 'idle' with resolvedLocation set,
 * and onRendered must fire — otherwise consumers waiting on those signals
 * deadlock forever (this hung the memory-client benchmark for 6 hours).
 *
 * Uses a raw createRoot without the act() test environment: act-driven
 * flushing re-renders between the isLoading toggles and masks the race.
 *
 * Note: vitest's jsdom scheduler still observes the flip more often than the
 * benchmark's environment, so this test pins the CONTRACT; the deterministic
 * regression guard for the original hang is the memory-client:react
 * benchmark (benchmarks/memory/client/scenarios/mount-unmount), which CI runs.
 */

let prevActEnv: unknown

beforeEach(() => {
  prevActEnv = (globalThis as any).IS_REACT_ACT_ENVIRONMENT
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

afterEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = prevActEnv
})

async function until(assert: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 5000
  while (!assert()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

test('mounting after a settled load still resolves status and fires onRendered', async () => {
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: () => 'home data',
    component: () => <div data-testid="home">Home</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  const onRendered = vi.fn()
  const onResolved = vi.fn()
  const onLoad = vi.fn()
  const unsubscribers = [
    router.subscribe('onRendered', onRendered),
    router.subscribe('onResolved', onResolved),
    router.subscribe('onLoad', onLoad),
  ]
  const unsubscribe = () => unsubscribers.forEach((fn) => fn())
  const container = document.createElement('div')
  document.body.appendChild(container)
  const reactRoot = createRoot(container)

  try {
    // Load fully settles before the provider mounts — the exact shape of the
    // memory benchmark's mount/unmount cycle.
    await router.load()
    reactRoot.render(<RouterProvider router={router} />)

    await until(
      () => container.querySelector('[data-testid="home"]') !== null,
      'route content to render',
    )
    await until(() => onRendered.mock.calls.length > 0, 'onRendered to fire')
    await until(() => onResolved.mock.calls.length > 0, 'onResolved to fire')
    await until(() => onLoad.mock.calls.length > 0, 'onLoad to fire')
  } finally {
    unsubscribe()
    reactRoot.unmount()
    container.remove()
  }
})
