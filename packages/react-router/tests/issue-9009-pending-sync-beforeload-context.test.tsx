import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setupRouter(options: {
  parentBeforeLoadDelayMs?: number
  bBeforeLoad?: () => { fromB: string } | Promise<{ fromB: string }>
  defaultPendingMs?: number
}) {
  const bLoaderStarted = createControlledPromise<void>()
  const bLoaderGate = createControlledPromise<string>()
  const pendingRenderContexts: Array<{
    fromParent?: string
    fromB?: string
  }> = []

  const rootRoute = createRootRoute({ component: Outlet })
  let parentCalls = 0
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    beforeLoad: async () => {
      parentCalls++
      if (parentCalls > 1 && options.parentBeforeLoadDelayMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, options.parentBeforeLoadDelayMs),
        )
      }
      return { fromParent: 'parent' }
    },
    component: Outlet,
  })
  const aRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/a',
    component: () => <div data-testid="route-a">Route A</div>,
  })
  const bRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/b',
    beforeLoad: options.bBeforeLoad ?? (() => ({ fromB: 'b' })),
    loader: () => {
      bLoaderStarted.resolve()
      return bLoaderGate
    },
    pendingComponent: () => {
      const ctx: { fromParent?: string; fromB?: string } =
        bRoute.useRouteContext()
      pendingRenderContexts.push({
        fromParent: ctx.fromParent,
        fromB: ctx.fromB,
      })
      return (
        <div data-testid="b-pending">
          pending:{ctx.fromParent ?? 'missing'}:{ctx.fromB ?? 'missing'}
        </div>
      )
    },
    component: () => {
      const ctx = bRoute.useRouteContext()
      return (
        <div data-testid="b-ready">
          ready:{ctx.fromParent}:{ctx.fromB}:{bRoute.useLoaderData()}
        </div>
      )
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      parentRoute.addChildren([aRoute, bRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/parent/a'] }),
    defaultPendingMs: options.defaultPendingMs ?? 200,
    defaultPendingMinMs: 0,
  })

  return {
    router,
    bLoaderStarted,
    bLoaderGate,
    pendingRenderContexts,
  }
}

test('#9009: pendingComponent receives synchronous beforeLoad context on fast navigation', async () => {
  vi.useFakeTimers()
  const { router, bLoaderStarted, bLoaderGate, pendingRenderContexts } =
    setupRouter({ parentBeforeLoadDelayMs: 0 })

  render(<RouterProvider router={router} />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByTestId('route-a')).toBeInTheDocument()

  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/parent/b' })
    await bLoaderStarted
    await vi.advanceTimersByTimeAsync(200)
  })

  expect(screen.getByTestId('b-pending')).toHaveTextContent('pending:parent:b')
  expect(pendingRenderContexts.length).toBeGreaterThan(0)
  expect(
    pendingRenderContexts.every(
      (c) => c.fromParent === 'parent' && c.fromB === 'b',
    ),
  ).toBe(true)

  await act(async () => {
    bLoaderGate.resolve('done')
    await navigation
  })
  expect(screen.getByTestId('b-ready')).toHaveTextContent('ready:parent:b:done')
})

test('#9009: pendingComponent receives synchronous beforeLoad context after slow ancestor beforeLoad', async () => {
  vi.useFakeTimers()
  const { router, bLoaderStarted, bLoaderGate, pendingRenderContexts } =
    setupRouter({ parentBeforeLoadDelayMs: 400 })

  render(<RouterProvider router={router} />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByTestId('route-a')).toBeInTheDocument()

  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/parent/b' })
    await vi.advanceTimersByTimeAsync(400)
    await bLoaderStarted
    await vi.advanceTimersByTimeAsync(0)
  })

  expect(screen.getByTestId('b-pending')).toHaveTextContent('pending:parent:b')
  expect(pendingRenderContexts.length).toBeGreaterThan(0)
  expect(
    pendingRenderContexts.every(
      (c) => c.fromParent === 'parent' && c.fromB === 'b',
    ),
  ).toBe(true)

  await act(async () => {
    bLoaderGate.resolve('done')
    await navigation
  })
  expect(screen.getByTestId('b-ready')).toHaveTextContent('ready:parent:b:done')
})

test('#9009: pendingComponent receives synchronous beforeLoad context when time elapses past pendingMs before contextualize', async () => {
  vi.useFakeTimers()
  const { router, bLoaderStarted, bLoaderGate, pendingRenderContexts } =
    setupRouter({ parentBeforeLoadDelayMs: 0 })

  render(<RouterProvider router={router} />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByTestId('route-a')).toBeInTheDocument()

  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/parent/b' })
    // Simulate main-thread stall past defaultPendingMs (200ms) right after navigate()
    // before the queued client transaction executes.
    vi.setSystemTime(Date.now() + 400)
    await bLoaderStarted
    await vi.advanceTimersByTimeAsync(0)
  })

  expect(screen.getByTestId('b-pending')).toHaveTextContent('pending:parent:b')
  expect(pendingRenderContexts.length).toBeGreaterThan(0)
  expect(
    pendingRenderContexts.every(
      (c) => c.fromParent === 'parent' && c.fromB === 'b',
    ),
  ).toBe(true)

  await act(async () => {
    bLoaderGate.resolve('done')
    await navigation
  })
  expect(screen.getByTestId('b-ready')).toHaveTextContent('ready:parent:b:done')
})

test('#9009: pendingComponent still renders while an async beforeLoad is in flight', async () => {
  vi.useFakeTimers()
  const bBeforeLoadStarted = createControlledPromise<void>()
  const bBeforeLoadGate = createControlledPromise<{ fromB: string }>()
  const { router, bLoaderStarted, bLoaderGate } = setupRouter({
    parentBeforeLoadDelayMs: 0,
    defaultPendingMs: 0,
    bBeforeLoad: () => {
      bBeforeLoadStarted.resolve()
      return bBeforeLoadGate
    },
  })

  render(<RouterProvider router={router} />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByTestId('route-a')).toBeInTheDocument()

  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/parent/b' })
    await bBeforeLoadStarted
    await vi.advanceTimersByTimeAsync(0)
  })

  expect(screen.getByTestId('b-pending')).toHaveTextContent(
    'pending:parent:missing',
  )

  await act(async () => {
    bBeforeLoadGate.resolve({ fromB: 'b' })
    await bLoaderStarted
    bLoaderGate.resolve('done')
    await navigation
  })
  expect(screen.getByTestId('b-ready')).toHaveTextContent('ready:parent:b:done')
})
