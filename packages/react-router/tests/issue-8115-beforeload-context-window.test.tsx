import * as React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// https://github.com/TanStack/router/issues/8115
test('#8115: a reloading match keeps its previous beforeLoad context until the new result lands', async () => {
  vi.useFakeTimers()

  const observed: Array<unknown> = []
  let runs = 0
  const rootRoute = createRootRoute({
    beforeLoad: async ({ matches }) => {
      runs++
      if (runs > 1) {
        observed.push((matches[0] as any).context?.locale)
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
      return { locale: 'en' }
    },
    component: () => <div data-testid="content">ok</div>,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100)
  })
  expect(screen.getByTestId('content')).toBeInTheDocument()

  await act(async () => {
    void router.invalidate()
    await vi.advanceTimersByTimeAsync(100)
  })

  expect(runs).toBe(2)
  expect(observed).toEqual(['en'])
})
