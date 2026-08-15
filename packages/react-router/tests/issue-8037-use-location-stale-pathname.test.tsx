import { act } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useLocation,
} from '../src'

afterEach(() => {
  cleanup()
})

// https://github.com/TanStack/router/issues/8037
test('#8037: useLocation in a route component does not report the pathname it is navigating to', async () => {
  const seen: Array<string> = []

  function Probe() {
    seen.push(useLocation().pathname)
    return <div>Posts</div>
  }

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Home</div>,
  })
  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
    component: Probe,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    history: createMemoryHistory({ initialEntries: ['/posts'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Posts')).toBeInTheDocument()

  await act(() => router.navigate({ to: '/' }))
  expect(await screen.findByText('Home')).toBeInTheDocument()

  expect(seen).not.toContain('/')
})
