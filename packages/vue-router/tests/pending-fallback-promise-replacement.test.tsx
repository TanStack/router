import { cleanup, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, expect, test } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'

const testCleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  while (testCleanups.length) {
    await testCleanups.pop()!()
  }
  cleanup()
})

test('a continuously visible fallback keeps its deadline across replacement loads', async () => {
  const firstReload = createControlledPromise<void>()
  const secondReload = createControlledPromise<void>()
  const reloads = [firstReload, secondReload]
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

  const firstInvalidation = router.invalidate({ forcePending: true })
  const invalidations = [firstInvalidation]
  testCleanups.push(async () => {
    firstReload.resolve()
    secondReload.resolve()
    await Promise.allSettled(invalidations)
  })
  expect(await screen.findByTestId('pending')).toBeInTheDocument()

  const firstPromise = router.state.matches[0]!._.loadPromise!
  await waitFor(() => expect(firstPromise.pendingUntil).toBeTypeOf('number'))

  await new Promise((resolve) => setTimeout(resolve, 25))
  invalidations.push(router.invalidate({ forcePending: true }))

  let secondPromise = router.state.matches[0]!._.loadPromise!
  await waitFor(() => {
    secondPromise = router.state.matches[0]!._.loadPromise!
    expect(secondPromise).not.toBe(firstPromise)
    expect(secondPromise.pendingUntil).toBeTypeOf('number')
  })
  expect(secondPromise.pendingUntil).toBe(firstPromise.pendingUntil)
})
