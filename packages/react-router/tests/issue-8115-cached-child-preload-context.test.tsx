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

afterEach(cleanup)

test('navigation merges fresh parent context with cached child preload context', async () => {
  let parentBeforeLoadRuns = 0
  let childContextRuns = 0
  let childLoaderRuns = 0

  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Home</div>,
  })
  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    beforeLoad: ({ preload }) => {
      parentBeforeLoadRuns++
      return {
        parentValue: preload ? 'parent-preload' : 'parent-navigation',
      }
    },
    component: Outlet,
  })
  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    context: ({ context, preload }) => {
      childContextRuns++
      return {
        childValue: `${preload ? 'child-preload' : 'child-navigation'}:${context.parentValue}`,
      }
    },
    loader: () => {
      childLoaderRuns++
      return 'child data'
    },
    preloadStaleTime: Infinity,
    component: () => {
      const { parentValue, childValue } = childRoute.useRouteContext()
      return (
        <div data-testid="context">
          {JSON.stringify({ parentValue, childValue })}
        </div>
      )
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      parentRoute.addChildren([childRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Home')).toBeInTheDocument()

  await act(() => router.preloadRoute({ to: '/parent/child' }))
  expect(parentBeforeLoadRuns).toBe(1)
  expect(childContextRuns).toBe(1)
  expect(childLoaderRuns).toBe(1)

  await act(() => router.navigate({ to: '/parent/child' }))

  expect(await screen.findByTestId('context')).toHaveTextContent(
    JSON.stringify({
      parentValue: 'parent-navigation',
      childValue: 'child-preload:parent-preload',
    }),
  )
  expect(parentBeforeLoadRuns).toBe(2)
  expect(childContextRuns).toBe(1)
  expect(childLoaderRuns).toBe(1)
})
