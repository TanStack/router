import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

test('delayed component preload reveals pending UI', async () => {
  const componentGate = createControlledPromise<void>()
  const Page = Object.assign(() => <div>Page content</div>, {
    preload: () => componentGate,
  })
  const rootRoute = createRootRoute({})
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    component: Page,
    pendingMs: 10,
    pendingComponent: () => <div>Loading page...</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })

  render(<RouterProvider router={router} />)

  expect(await screen.findByText('Loading page...')).toBeInTheDocument()
  componentGate.resolve()
  expect(await screen.findByText('Page content')).toBeInTheDocument()
  expect(screen.queryByText('Loading page...')).not.toBeInTheDocument()
})
