import { cleanup, render, screen } from '@testing-library/vue'
import { expect, onTestFinished, test, vi } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'

test('a continuously visible fallback keeps its deadline across replacement loads', async () => {
  const firstReload = createControlledPromise<void>()
  const secondReload = createControlledPromise<void>()
  const reloads = [firstReload, secondReload]
  const invalidations: Array<Promise<void>> = []
  onTestFinished(async () => {
    try {
      firstReload.resolve()
      secondReload.resolve()
      if (vi.isFakeTimers()) {
        await vi.runAllTimersAsync()
      }
      await Promise.allSettled(invalidations)
    } finally {
      cleanup()
      vi.useRealTimers()
    }
  })
  let loaderCall = 0

  const rootRoute = createRootRoute({
    pendingMs: 0,
    pendingMinMs: 100,
    pendingComponent: () => <div data-testid="pending">Pending</div>,
    loader: () => {
      const generation = ++loaderCall
      const gate = reloads[generation - 2]
      return gate ? gate.then(() => generation) : generation
    },
    component: () => <div>Content</div>,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Content')).toBeInTheDocument()

  vi.useFakeTimers()
  const firstInvalidation = router.invalidate({ forcePending: true })
  invalidations.push(firstInvalidation)
  await vi.advanceTimersByTimeAsync(0)
  expect(screen.getByTestId('pending')).toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(25)
  let secondSettled = false
  const secondInvalidation = router
    .invalidate({ forcePending: true })
    .then(() => {
      secondSettled = true
    })
  invalidations.push(secondInvalidation)

  firstReload.resolve()
  secondReload.resolve()
  await Promise.resolve()

  await vi.advanceTimersByTimeAsync(74)
  expect(secondSettled).toBe(false)
  expect(screen.getByTestId('pending')).toBeInTheDocument()

  await vi.advanceTimersByTimeAsync(1)
  await Promise.all(invalidations)
  expect(screen.getByText('Content')).toBeInTheDocument()
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
})
