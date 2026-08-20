import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
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
})

test('a same-id child retry presents one coherent beforeLoad context generation', async () => {
  const childReloadStarted = createControlledPromise<void>()
  const childReload = createControlledPromise<void>()
  let parentGeneration = 0
  let childLoads = 0

  const rootRoute = createRootRoute({ component: Outlet })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    beforeLoad: () => ({ generation: ++parentGeneration }),
    component: () => (
      <div>
        <div data-testid="parent-generation">
          Parent generation {parentRoute.useRouteContext().generation}
        </div>
        <Outlet />
      </div>
    ),
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    beforeLoad: ({ context }) => ({
      inheritedGeneration: context.generation,
    }),
    loader: async () => {
      if (++childLoads > 1) {
        childReloadStarted.resolve()
        await childReload
      }
    },
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => (
      <div data-testid="child-pending-generation">
        Child generation {childRoute.useRouteContext().inheritedGeneration}
      </div>
    ),
    component: () => (
      <div data-testid="child-generation">
        Child generation {childRoute.useRouteContext().inheritedGeneration}
      </div>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('parent-generation')).toHaveTextContent(
    'Parent generation 1',
  )
  expect(screen.getByTestId('child-generation')).toHaveTextContent(
    'Child generation 1',
  )
  await waitFor(() => expect(router.state.status).toBe('idle'))
  const initialChildId = router.state.matches.find(
    (match) => match.routeId === childRoute.id,
  )?.id
  expect(initialChildId).toBeDefined()

  let invalidation: Promise<void> | undefined
  try {
    await act(async () => {
      invalidation = router.invalidate({
        filter: (match) =>
          match.routeId === parentRoute.id || match.routeId === childRoute.id,
        forcePending: true,
      })
      await childReloadStarted
    })

    expect(screen.getByTestId('parent-generation')).toHaveTextContent(
      'Parent generation 2',
    )
    expect(screen.getByTestId('child-pending-generation')).toHaveTextContent(
      'Child generation 2',
    )
    expect(
      router.state.matches.find(
        (match) => match.routeId === parentRoute.id,
      ),
    ).toMatchObject({
      status: 'success',
      context: { generation: 2 },
    })
    expect(
      router.state.matches.find((match) => match.routeId === childRoute.id),
    ).toMatchObject({
      id: initialChildId,
      status: 'pending',
      context: { generation: 2, inheritedGeneration: 2 },
    })
  } finally {
    childReload.resolve()
    await act(async () => {
      await Promise.allSettled(invalidation ? [invalidation] : [])
    })
  }
})
