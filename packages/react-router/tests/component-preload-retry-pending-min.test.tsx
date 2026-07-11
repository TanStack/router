import * as React from 'react'
import { act } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createControlledPromise } from '@tanstack/router-core'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useRouter,
} from '../src'
import type { ErrorComponentProps } from '../src'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  cleanup()
})

/**
 * A component-only route can fail while preloading its code, then retry from
 * its error UI through invalidate(). The retry is a fresh pending generation:
 * it needs a match-local load promise so the rendered pending component can
 * attach pendingMinMs to the work that actually owns readiness.
 */
test('component preload retry owns readiness and honors pendingMinMs', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  const retryChunk = createControlledPromise<void>()
  let preloadAttempt = 0
  let retryPromise: Promise<void> | undefined
  let retrySettled = false

  const Page = Object.assign(
    () => <div data-testid="page-content">Page content</div>,
    {
      preload: vi.fn(() => {
        preloadAttempt++
        return preloadAttempt === 1
          ? Promise.reject(new Error('initial chunk request failed'))
          : retryChunk
      }),
    },
  )

  function RetryError({ reset }: ErrorComponentProps) {
    const router = useRouter()
    return (
      <button
        type="button"
        onClick={() => {
          reset()
          retryPromise = router.invalidate()
          void retryPromise.then(() => {
            retrySettled = true
          })
        }}
      >
        Retry chunk
      </button>
    )
  }

  const rootRoute = createRootRoute({})
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
    component: Page,
    errorComponent: RetryError,
    pendingMs: 0,
    pendingMinMs: 100,
    pendingComponent: () => (
      <div data-testid="page-pending">Loading page...</div>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/page'] }),
  })

  render(<RouterProvider router={router} />)

  expect(
    await screen.findByRole('button', { name: 'Retry chunk' }),
  ).toBeInTheDocument()
  expect(Page.preload).toHaveBeenCalledTimes(1)

  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('button', { name: 'Retry chunk' }))

  // Let pendingMs: 0 publish the retry lane. The active pending match should
  // now expose the local promise that owns this component request.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByTestId('page-pending')).toBeInTheDocument()

  const retryMatch = router.state.matches.find(
    (match) => match.routeId === pageRoute.id,
  )
  const hadLocalReadinessOwner = retryMatch?._.loadPromise?.status === 'pending'

  await act(async () => {
    retryChunk.resolve()
    await Promise.resolve()
  })

  expect.soft(hadLocalReadinessOwner).toBe(true)
  expect.soft(retrySettled).toBe(false)
  expect.soft(screen.queryByTestId('page-pending')).toBeInTheDocument()
  expect.soft(screen.queryByTestId('page-content')).not.toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(99)
  })
  expect(screen.getByTestId('page-pending')).toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
    await retryPromise
  })

  expect(Page.preload).toHaveBeenCalledTimes(2)
  expect(screen.getByTestId('page-content')).toBeInTheDocument()
  expect(screen.queryByTestId('page-pending')).not.toBeInTheDocument()
})
