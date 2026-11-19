import { cleanup, render, screen } from '@testing-library/react'
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

// https://github.com/TanStack/router/issues/8936
test('the initial route loads with a basepath on a custom-protocol origin', async () => {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div data-testid="index">Index</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    basepath: '/app-x',
    origin: 'tauri://localhost:7644',
    history: createMemoryHistory({ initialEntries: ['/app-x/'] }),
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('index')).toBeInTheDocument()
  expect(router.state.matches.map((m) => m.status)).toEqual([
    'success',
    'success',
  ])
})
