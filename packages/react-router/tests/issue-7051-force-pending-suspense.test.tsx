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

// Ported from PR #7051. On old main, invalidate({ forcePending: true }) set the
// active match back to status 'pending' while its loadPromise was already
// settled/cleared, so MatchInner threw `undefined` and React rendered the error
// boundary instead of the pending fallback. On this branch the pending throw
// falls back to router.latestLoadPromise (Match.tsx getLoadPromise), so the
// suspense/pending fallback must keep rendering until the reload commits.
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
  act(() => {
    void router.invalidate({ forcePending: true })
  })

  expect(
    await screen.findByTestId('force-pending-fallback'),
  ).toBeInTheDocument()
  expect(errorComponentRendered).not.toHaveBeenCalled()
  expect(screen.queryByTestId('force-pending-error')).not.toBeInTheDocument()

  act(() => {
    resolveReload?.()
  })

  await act(() => router.latestLoadPromise)
  expect(await screen.findByTestId('force-pending-route')).toHaveTextContent(
    'done',
  )
})
