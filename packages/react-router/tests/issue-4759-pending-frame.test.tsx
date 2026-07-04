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
// With pendingMs: 0 the pending fallback must be visible from the very first
// paint of the initial load. Deferring pending publication to a macrotask
// (setTimeout) leaves at least one committed render where the router outputs
// nothing, which flashes the app shell background (the "red frame") before
// the pending UI appears.
describe('issue #4759: no blank frame before pending UI when pendingMs is 0', () => {
  test('pending fallback is committed on mount without waiting for a macrotask', async () => {
    let resolveLoader!: (value: string) => void
    const loaderPromise = new Promise<string>((resolve) => {
      resolveLoader = resolve
    })

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      pendingMs: 0,
      pendingMinMs: 0,
      pendingComponent: () => <div data-testid="pending">pending...</div>,
      loader: () => loaderPromise,
      component: () => <div data-testid="loaded">loaded</div>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history,
    })

    render(<RouterProvider router={router} />)

    // Flush microtasks only — deliberately no timer/macrotask turn. Any
    // implementation that defers pending publication to setTimeout cannot
    // have published yet, which is precisely the blank painted frame from
    // the issue. The pending fallback must already be in the DOM here.
    await act(async () => {})
    expect(screen.getByTestId('pending')).toBeInTheDocument()

    // Sanity: the load still completes normally afterwards.
    resolveLoader('done')
    expect(await screen.findByTestId('loaded')).toBeInTheDocument()
    expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  })
})
