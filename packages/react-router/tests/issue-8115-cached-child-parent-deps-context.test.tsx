import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

test('a cached child context contribution is merged with fresh parent context', async () => {
  const rootRoute = createRootRoute({ component: Outlet })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    validateSearch: (search: Record<string, unknown>) => ({
      version: Number(search.version),
    }),
    loaderDeps: ({ search }) => ({ version: search.version }),
    context: ({ deps }) => ({ parentVersion: `version-${deps.version}` }),
    component: Outlet,
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loaderDeps: () => ({ stable: true }),
    context: ({ context }) => ({
      childSnapshot: `derived-from-${context.parentVersion}`,
    }),
    component: () => {
      const context = childRoute.useRouteContext()
      return (
        <div>
          Parent: {context.parentVersion}; cached child: {context.childSnapshot}
        </div>
      )
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({
      initialEntries: ['/parent/child?version=1'],
    }),
  })

  render(<RouterProvider router={router} />)

  expect(
    await screen.findByText(
      'Parent: version-1; cached child: derived-from-version-1',
    ),
  ).toBeInTheDocument()

  const initialParentMatchId = router.state.matches.find(
    (match) => match.routeId === parentRoute.id,
  )?.id
  const initialChildMatchId = router.state.matches.find(
    (match) => match.routeId === childRoute.id,
  )?.id

  expect(initialParentMatchId).toBeDefined()
  expect(initialChildMatchId).toBeDefined()

  await act(() =>
    router.navigate({
      to: '/parent/child',
      search: { version: 2 },
    }),
  )

  expect(
    screen.getByText('Parent: version-2; cached child: derived-from-version-1'),
  ).toBeInTheDocument()

  const nextParentMatchId = router.state.matches.find(
    (match) => match.routeId === parentRoute.id,
  )?.id
  const nextChildMatchId = router.state.matches.find(
    (match) => match.routeId === childRoute.id,
  )?.id

  expect(nextParentMatchId).not.toBe(initialParentMatchId)
  expect(nextChildMatchId).toBe(initialChildMatchId)
})
