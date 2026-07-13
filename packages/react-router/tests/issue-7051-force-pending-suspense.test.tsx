import { act } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  vi.clearAllMocks()
  cleanup()
})

// Ported from PR #7051. A forced-pending reload must keep showing its pending
// fallback until fresh content commits instead of exposing the error boundary.
test('invalidate({ forcePending: true }) keeps rendering the pending fallback instead of the error boundary', async () => {
  const history = createMemoryHistory({
    initialEntries: ['/force-pending'],
  })
  const errorComponentRendered = vi.fn()
  let shouldSuspendReload = false
  let resolveReload: (() => void) | undefined

  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  })

  const forcePendingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/force-pending',
    pendingMs: 0,
    pendingMinMs: 10,
    loader: async () => {
      if (shouldSuspendReload) {
        await new Promise<void>((resolve) => {
          resolveReload = resolve
        })
      }

      return 'done'
    },
    component: () => (
      <div data-testid="force-pending-route">
        {forcePendingRoute.useLoaderData()}
      </div>
    ),
    pendingComponent: () => (
      <div data-testid="force-pending-fallback">Pending...</div>
    ),
    errorComponent: ({ error }) => {
      errorComponentRendered(error)
      return <div data-testid="force-pending-error">{String(error)}</div>
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([forcePendingRoute]),
    history,
  })

  render(<RouterProvider router={router} />)

  await act(() => router.load())
  expect(await screen.findByTestId('force-pending-route')).toHaveTextContent(
    'done',
  )

  shouldSuspendReload = true
  let invalidation!: Promise<void>
  act(() => {
    invalidation = router.invalidate({ forcePending: true })
  })

  expect(
    await screen.findByTestId('force-pending-fallback'),
  ).toBeInTheDocument()
  expect(errorComponentRendered).not.toHaveBeenCalled()
  expect(screen.queryByTestId('force-pending-error')).not.toBeInTheDocument()

  act(() => {
    resolveReload?.()
  })

  await act(() => invalidation)
  expect(await screen.findByTestId('force-pending-route')).toHaveTextContent(
    'done',
  )
})
