import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
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

test('a same-id child beforeLoad error observes fresh inherited context', async () => {
  const childError = new Error('child beforeLoad failed')
  let parentGeneration = 0
  let renderedError: unknown

  const rootRoute = createRootRoute({ component: Outlet })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    loaderDeps: () => ({ stable: true }),
    beforeLoad: () => ({ generation: ++parentGeneration }),
    component: Outlet,
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    loaderDeps: () => ({ stable: true }),
    beforeLoad: ({ context }) => {
      if (context.generation === 2) {
        throw childError
      }
    },
    component: () => (
      <div data-testid="child-generation">
        {childRoute.useRouteContext().generation}
      </div>
    ),
    errorComponent: ({ error }) => {
      renderedError = error
      const context = childRoute.useRouteContext()

      return (
        <div data-testid="child-error-generation">{context.generation}</div>
      )
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('child-generation')).toHaveTextContent('1')
  await waitFor(() => expect(router.state.status).toBe('idle'))
  const initialChildMatchId = router.state.matches.find(
    (match) => match.routeId === childRoute.id,
  )?.id
  expect(initialChildMatchId).toBeDefined()

  await act(() => router.invalidate())

  expect(await screen.findByTestId('child-error-generation')).toBeInTheDocument()
  expect(renderedError).toBe(childError)
  expect(
    router.state.matches.find((match) => match.routeId === childRoute.id)?.id,
  ).toBe(initialChildMatchId)
  expect(screen.getByTestId('child-error-generation')).toHaveTextContent('2')
})
