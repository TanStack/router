import * as React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { createControlledPromise } from '@tanstack/router-core'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '../src'

// React 19.3+ logs its "conditional use()" warning at most once per module
// instance, so this file holds a single cold-load case.

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('a split pendingComponent offered before its chunk arrives calls use() on every render', async () => {
  const pendingImport = createControlledPromise<{
    default: () => React.JSX.Element
  }>()
  const Pending = lazyRouteComponent(() => pendingImport)
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <p>Home</p>,
  })
  const listRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/list',
    loader: () => 'loaded',
    component: lazyRouteComponent(() =>
      Promise.resolve({ default: () => <p>List</p> }),
    ),
    pendingComponent: Pending,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, listRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    // Offer the pending component at once and keep it shown, so it renders
    // again after its chunk arrives.
    defaultPendingMs: 0,
    defaultPendingMinMs: 300,
  })
  const errors: Array<string> = []
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    errors.push(args.map(String).join(' '))
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Home')).toBeInTheDocument()
  await act(async () => {
    void router.navigate({ to: '/list' })
  })
  // Outside act(), as in a browser: React drops the suspended render and
  // starts it afresh once the chunk arrives.
  await new Promise((resolve) => setTimeout(resolve, 50))
  pendingImport.resolve({ default: () => <p>Loading list</p> })

  expect(await screen.findByText('List')).toBeInTheDocument()
  expect(errors).toEqual([])
})
