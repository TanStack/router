import * as React from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import {
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { RouterHistory } from '../src'

let history: RouterHistory

beforeEach(() => {
  history = createBrowserHistory()
  expect(window.location.pathname).toBe('/')
})

afterEach(() => {
  history.destroy()
  window.history.replaceState(null, 'root', '/')
  vi.resetAllMocks()
  cleanup()
})

// Repro for https://github.com/TanStack/router/issues/4759
//
// JSDOM cannot observe browser paints. This unit reduction verifies the event
// ordering behind the issue: pending DOM must be published before the first
// macrotask when pendingMs is 0.
describe('issue #4759: pendingMs 0 publishes pending DOM before a macrotask', () => {
  test('pending fallback is committed on mount without waiting for a macrotask', async () => {
    vi.useFakeTimers()
    let resolveLoader!: (value: string) => void
    const loaderPromise = new Promise<string>((resolve) => {
      resolveLoader = resolve
    })

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => loaderPromise,
      component: () => <div data-testid="loaded">loaded</div>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history,
    })
    let resolveRendered!: () => void
    const rendered = new Promise<void>((resolve) => {
      resolveRendered = resolve
    })
    const unsubscribe = router.subscribe('onRendered', (event) => {
      if (event.toLocation.pathname === '/') {
        resolveRendered()
      }
    })

    try {
      render(
        <main>
          <RouterProvider
            router={router}
            defaultPendingMs={0}
            defaultPendingMinMs={0}
            defaultPendingComponent={() => (
              <div data-testid="pending">pending...</div>
            )}
          />
        </main>,
      )

      // Fake timers keep the first macrotask frozen. An implementation that
      // publishes pending state with setTimeout cannot satisfy this assertion.
      await act(async () => {})
      expect(screen.getByTestId('pending')).toBeInTheDocument()

      // Sanity: the load still completes normally afterwards.
      resolveLoader('done')
      await act(() => rendered)
      expect(screen.getByTestId('loaded')).toBeInTheDocument()
      expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
    } finally {
      unsubscribe()
      resolveLoader('done')
      vi.useRealTimers()
    }
  })
})
