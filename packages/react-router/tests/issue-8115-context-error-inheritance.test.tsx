import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

test('a child context error preserves inherited context without the child contribution', async () => {
  const contextError = new Error('child context failed')
  const rootRoute = createRootRouteWithContext<{ routerValue: string }>()({
    context: () => ({ rootValue: 'root' }),
    component: Outlet,
  })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    context: () => ({ parentValue: 'parent' }),
    component: Outlet,
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    context: (): { childValue: string } => {
      throw contextError
    },
    errorComponent: ({ error }) => {
      const context = childRoute.useRouteContext()

      return (
        <div>
          <div data-testid="route-error">
            {error === contextError ? contextError.message : 'unexpected error'}
          </div>
          <div data-testid="router-context">{context.routerValue}</div>
          <div data-testid="root-context">{context.rootValue}</div>
          <div data-testid="parent-context">{context.parentValue}</div>
          <div data-testid="child-context">
            {'childValue' in context ? context.childValue : 'absent'}
          </div>
        </div>
      )
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    context: { routerValue: 'router' },
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('route-error')).toHaveTextContent(
    contextError.message,
  )
  expect(screen.getByTestId('router-context')).toHaveTextContent('router')
  expect(screen.getByTestId('root-context')).toHaveTextContent('root')
  expect(screen.getByTestId('parent-context')).toHaveTextContent('parent')
  expect(screen.getByTestId('child-context')).toHaveTextContent('absent')
})
