import * as React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { createRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { createControlledPromise } from '@tanstack/router-core'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '../src'

// React 19.3+ logs its "conditional use()" warning at most once per module
// instance, so the cold-load case must stay the first test in this file.

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function collectConsoleErrors() {
  const errors: Array<string> = []
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    errors.push(args.map(String).join(' '))
  })
  return errors
}

test('a lazy component that suspends on a cold load calls use() on every render', async () => {
  const screenImport = createControlledPromise<{
    default: () => React.JSX.Element
  }>()
  // The wrapper hides `Screen.preload` from the router, so the lazy
  // component mounts before its chunk has arrived.
  const Screen = lazyRouteComponent(() => screenImport)
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const screenRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <React.Suspense fallback={<p>Loading screen</p>}>
        <Screen />
      </React.Suspense>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([screenRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const errors = collectConsoleErrors()

  // Render outside act(), as in a browser, so React retries the suspended
  // fiber on its own schedule once the chunk arrives.
  const actEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    root.render(<RouterProvider router={router} />)
    await vi.waitFor(() =>
      expect(container).toHaveTextContent('Loading screen'),
    )

    screenImport.resolve({ default: () => <p>Screen content</p> })

    await vi.waitFor(() =>
      expect(container).toHaveTextContent('Screen content'),
    )
    expect(errors).toEqual([])
  } finally {
    root.unmount()
    container.remove()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = actEnvironment
  }
})

test('a preloaded lazy component renders without suspending', async () => {
  const Screen = lazyRouteComponent(() =>
    Promise.resolve({ default: () => <p>Screen content</p> }),
  )
  await Screen.preload?.()
  const Fallback = vi.fn(() => <p>Outer fallback</p>)

  render(
    <React.Suspense fallback={<Fallback />}>
      <Screen />
    </React.Suspense>,
  )

  expect(screen.getByText('Screen content')).toBeInTheDocument()
  expect(Fallback).not.toHaveBeenCalled()
})

test('lazy route components the router loaded render without an outer fallback', async () => {
  const pageData = createControlledPromise<void>()
  const Page = lazyRouteComponent(() =>
    Promise.resolve({ default: () => <p>Page content</p> }),
  )
  const Pending = lazyRouteComponent(() =>
    Promise.resolve({ default: () => <p>Route pending</p> }),
  )
  // The root Outlet's boundary shows the default pending UI if a route's
  // own components suspend.
  const DefaultPending = vi.fn(() => <p>Default pending</p>)
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <p>Home</p>,
  })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    loader: () => pageData,
    component: Page,
    pendingComponent: Pending,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    defaultPendingComponent: DefaultPending,
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Home')).toBeInTheDocument()
  await router.loadRouteChunk(pageRoute)
  DefaultPending.mockClear()

  await act(async () => {
    void router.navigate({ to: '/page' })
  })
  expect(await screen.findByText('Route pending')).toBeInTheDocument()
  expect(DefaultPending).not.toHaveBeenCalled()

  await act(async () => {
    pageData.resolve()
  })
  expect(await screen.findByText('Page content')).toBeInTheDocument()
  expect(DefaultPending).not.toHaveBeenCalled()
})

test('a preloaded lazy component renders on the server without suspending', async () => {
  vi.stubGlobal('window', undefined)
  const Screen = lazyRouteComponent(() =>
    Promise.resolve({ default: () => <p>Screen content</p> }),
  )
  await Screen.preload?.()

  // A suspending component outside a Suspense boundary fails renderToString.
  expect(renderToString(<Screen />)).toBe('<p>Screen content</p>')
  expect(renderToString(<Screen />)).toBe('<p>Screen content</p>')
})

test('an already loaded lazy component re-renders in Strict Mode without errors', async () => {
  const Screen = lazyRouteComponent(() =>
    Promise.resolve({
      default: ({ count }: { count: number }) => <p>Count {count}</p>,
    }),
  )
  await Screen.preload?.()
  const errors = collectConsoleErrors()

  const { rerender } = render(
    <React.StrictMode>
      <Screen count={1} />
    </React.StrictMode>,
  )
  rerender(
    <React.StrictMode>
      <Screen count={2} />
    </React.StrictMode>,
  )

  expect(screen.getByText('Count 2')).toBeInTheDocument()
  expect(errors).toEqual([])
})

test('a missing named export reaches the route error component once', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const importer = vi.fn(() =>
    Promise.resolve({} as { Missing: () => React.JSX.Element }),
  )
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: lazyRouteComponent(importer, 'Missing'),
    errorComponent: () => <p>Page failed</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByText('Page failed')).toBeInTheDocument()
  expect(importer).toHaveBeenCalledOnce()
})
