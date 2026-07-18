import { cleanup, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, expect, test, vi } from 'vitest'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('the global catch boundary resets after a same-route reload', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})

  let shouldThrow = true
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => {
      if (shouldThrow) {
        throw new Error('transient render failure')
      }
      return <div>Recovered page</div>
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)

  expect(
    await screen.findByText('transient render failure'),
  ).toBeInTheDocument()
  await waitFor(() => expect(router.state.status).toBe('idle'))

  const fetchCountBeforeRetry = router.state.matches[0]!.fetchCount
  shouldThrow = false
  await router.invalidate()

  expect(router.state.matches[0]!.fetchCount).toBeGreaterThan(
    fetchCountBeforeRetry,
  )
  expect(await screen.findByText('Recovered page')).toBeInTheDocument()
})
