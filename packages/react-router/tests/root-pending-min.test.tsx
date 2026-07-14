import * as React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { hydrate } from '../src/ssr/client'
import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

const testCleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  while (testCleanups.length) {
    await testCleanups.pop()!()
  }
  cleanup()
  vi.useRealTimers()
  delete window.$_TSR
})

test('a post-hydration root reload keeps its fallback through pendingMinMs', async () => {
  const reloadGate = createControlledPromise<void>()
  const rootLoader = vi.fn(() => reloadGate.then(() => ({ generation: 2 })))
  const rootRoute = createRootRoute({
    pendingMs: 0,
    pendingMinMs: 100,
    pendingComponent: () => <div data-testid="root-pending">Pending</div>,
    loader: rootLoader,
    component: () => (
      <div data-testid="root-content">
        Generation {rootRoute.useLoaderData().generation}
      </div>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const rootMatch = router.matchRoutes(router.latestLocation)[0]!

  // This is the same public bootstrap shape produced by the server. Calling
  // hydrate() ensures router.ssr and the active match are established through
  // the real client hydration path rather than by mutating router stores.
  window.$_TSR = {
    router: {
      manifest: { routes: {} },
      dehydratedData: {},
      matches: [
        {
          i: rootMatch.id,
          s: 'success',
          ssr: true,
          l: { generation: 1 },
          u: Date.now(),
        },
      ],
    },
    h: vi.fn(),
    e: vi.fn(),
    c: vi.fn(),
    p: vi.fn(),
    buffer: [],
    initialized: false,
  }

  await hydrate(router)
  expect(router.ssr).toBeDefined()

  render(<RouterProvider router={router} />)
  expect(screen.getByTestId('root-content')).toHaveTextContent('Generation 1')
  expect(rootLoader).not.toHaveBeenCalled()

  vi.useFakeTimers()

  let invalidation!: Promise<void>
  await act(async () => {
    invalidation = router.invalidate({ forcePending: true })
    await vi.advanceTimersByTimeAsync(0)
  })

  expect(rootLoader).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('root-pending')).toBeInTheDocument()
  expect(screen.queryByTestId('root-content')).not.toBeInTheDocument()

  await act(async () => {
    reloadGate.resolve()
    await Promise.resolve()
  })

  await act(async () => {
    await vi.advanceTimersByTimeAsync(99)
  })
  expect(screen.getByTestId('root-pending')).toBeInTheDocument()
  expect(screen.queryByTestId('root-content')).not.toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
    await invalidation
  })
  expect(screen.queryByTestId('root-pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('root-content')).toHaveTextContent('Generation 2')
})

test('root route hydration preserves component state across its Suspense boundary', async () => {
  const mounts = vi.fn()
  const unmounts = vi.fn()
  const initializers = vi.fn(() => 'preserved')

  const rootRoute = createRootRoute({
    pendingComponent: () => <div>Root pending</div>,
    component: function RootComponent() {
      const [value] = React.useState(initializers)
      React.useEffect(() => {
        mounts()
        return unmounts
      }, [])
      return <div data-testid="root-content">{value}</div>
    },
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()

  // Model the server render and the client router produced by hydrate(). The
  // outer root boundary is intentionally absent from both trees, while the
  // route's own pending boundary is present in both.
  router.ssr = { manifest: { routes: {} } }
  router.isServer = true
  const html = renderToString(<RouterProvider router={router} />)
  router.isServer = false
  expect(html).toContain('<!--$-->')
  expect(html).toContain('preserved')

  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  let root!: ReturnType<typeof hydrateRoot>
  await act(async () => {
    root = hydrateRoot(container, <RouterProvider router={router} />)
    testCleanups.push(async () => {
      await act(() => root.unmount())
      consoleError.mockRestore()
      container.remove()
    })
    await Promise.resolve()
  })

  expect(container).toHaveTextContent('preserved')
  // One initializer belongs to the server render and one to client
  // hydration. The stable boundary must preserve that hydrated client
  // instance instead of creating a third one.
  expect(initializers).toHaveBeenCalledTimes(2)
  expect(mounts).toHaveBeenCalledTimes(1)
  expect(unmounts).not.toHaveBeenCalled()
  expect(consoleError).not.toHaveBeenCalled()
})

test('server rendering uses the root pending boundary for route component suspension', async () => {
  const gate = createControlledPromise<void>()
  const rootRoute = createRootRoute({
    pendingComponent: () => <div>Server root pending</div>,
    component: () => {
      throw gate
    },
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  router.isServer = true
  await router.load()

  const html = renderToString(<RouterProvider router={router} />)

  // renderToString cannot wait for Suspense, but the root route's stable
  // boundary contains the suspension and emits its fallback. Streaming SSR
  // can wait for the same boundary instead.
  expect(html).toContain('Server root pending')
})

test('Transitioner remount loads hydrated history changes made while unmounted', async () => {
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index route</div>,
  })
  const nextRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/next',
    component: () => <div>Next route</div>,
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, nextRoute]),
    history,
  })
  const matches = router.matchRoutes(router.latestLocation)
  const now = Date.now()

  window.$_TSR = {
    router: {
      manifest: { routes: {} },
      dehydratedData: {},
      matches: matches.map((match) => ({
        i: match.id,
        s: 'success' as const,
        ssr: true,
        u: now,
      })),
    },
    h: vi.fn(),
    e: vi.fn(),
    c: vi.fn(),
    p: vi.fn(),
    buffer: [],
    initialized: false,
  }

  await hydrate(router)
  const firstRender = render(<RouterProvider router={router} />)
  expect(screen.getByText('Index route')).toBeInTheDocument()

  firstRender.unmount()
  history.push('/next')

  const secondRender = render(<RouterProvider router={router} />)
  expect(await screen.findByText('Next route')).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/next')

  secondRender.unmount()
  history.push('/next', { marker: 'new history entry' })

  render(<RouterProvider router={router} />)
  await vi.waitFor(() => {
    expect((router.state.location.state as any).marker).toBe(
      'new history entry',
    )
  })
})
