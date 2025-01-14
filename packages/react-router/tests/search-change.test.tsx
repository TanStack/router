import { cleanup, render, screen } from '@testing-library/react'

import { afterEach, expect, test, vi } from 'vitest'

import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import React from 'react'

afterEach(() => {
  cleanup()
})

test('route is not reloading on search change if it is not in deps', async () => {
  const rootRoute = createRootRoute({})
  const loaderMockFn = vi.fn()

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: (search: Record<string, unknown>) => {
      return { index: typeof search.index === 'number' ? search.index : 0 }
    },
    component: () => {
      const { index } = indexRoute.useSearch()

      return <span>Index {index}</span>
    },
    loader: loaderMockFn,
  })

  const routeTree = rootRoute.addChildren([indexRoute])
  const router = createRouter({
    routeTree,
  })

  render(<RouterProvider router={router} />)

  const initialIndexEl = await screen.findByText('Index 0')
  expect(initialIndexEl.textContent).toBe('Index 0')
  expect(loaderMockFn).toBeCalledTimes(1)

  router.navigate({ search: { index: 1 } })

  const updatedIndexEl = await screen.findByText('Index 1')
  expect(updatedIndexEl.textContent).toBe('Index 1')
  expect(loaderMockFn).toBeCalledTimes(1)
})

test('route is reloading on search change if it is in deps', async () => {
  const rootRoute = createRootRoute({})
  const loaderMockFn = vi.fn()

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: (search: Record<string, unknown>) => {
      return { index: typeof search.index === 'number' ? search.index : 0 }
    },
    component: () => {
      const { index } = indexRoute.useSearch()

      return <span>Index {index}</span>
    },
    loaderDeps: ({ search }) => ({ index: search.index }),
    loader: loaderMockFn,
  })

  const routeTree = rootRoute.addChildren([indexRoute])
  const router = createRouter({
    routeTree,
  })

  render(<RouterProvider router={router} />)

  const initialIndexEl = await screen.findByText('Index 0')
  expect(initialIndexEl.textContent).toBe('Index 0')
  expect(loaderMockFn).toBeCalledTimes(1)

  router.navigate({ search: { index: 1 } })

  const updatedIndexEl = await screen.findByText('Index 1')
  expect(updatedIndexEl.textContent).toBe('Index 1')
  expect(loaderMockFn).toBeCalledTimes(2)
})
