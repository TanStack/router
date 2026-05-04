/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
/**
 * `lazyRouteComponent` defers loading a component module until the
 * route is matched. Confirms:
 *
 *  - The route renders the lazy-loaded component once resolved.
 *  - The first render shows nothing / a stub until import resolves.
 */
import { afterEach, describe, expect, test } from 'vitest'
import { render } from '@remix-run/ui/test'
import { createMemoryHistory } from '@tanstack/history'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '../../src'
import type { Handle } from '@remix-run/ui'

let activeCleanup: (() => void) | null = null
afterEach(() => {
  activeCleanup?.()
  activeCleanup = null
})

describe('lazyRouteComponent', () => {
  test('renders the lazy component once it has loaded', async () => {
    function Root(_h: Handle) {
      return () => <Outlet />
    }

    const lazyComp = lazyRouteComponent(() =>
      Promise.resolve({
        default: function LazyComp(_h: Handle) {
          return () => <p id="lazy">lazy-loaded</p>
        },
      }),
    )

    const root = createRootRoute({ component: Root })
    const home = createRoute({
      getParentRoute: () => root,
      path: '/',
      component: lazyComp,
    })
    root.addChildren([home])
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()

    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    // Allow the lazy import promise to settle.
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(result.$('#lazy')?.textContent).toBe('lazy-loaded')
  })
})
