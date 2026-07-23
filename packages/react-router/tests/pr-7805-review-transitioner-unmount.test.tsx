import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
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
  vi.useRealTimers()
})

test('a navigation started after the provider unmounts cannot wait on its renderer acknowledgement', async () => {
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index</div>,
  })
  const nextRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/next',
    component: () => <div>Next</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, nextRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  const rendered = render(<RouterProvider router={router} />)
  expect(await screen.findByText('Index')).toBeInTheDocument()
  await waitFor(() => expect(router.state.status).toBe('idle'))

  rendered.unmount()

  const navigation = router.navigate({ to: '/next' })
  let stallTimer: ReturnType<typeof setTimeout> | undefined
  const outcome = await Promise.race([
    navigation.then(() => 'resolved' as const),
    new Promise<'stalled'>((resolve) => {
      stallTimer = setTimeout(() => resolve('stalled'), 100)
    }),
  ]).finally(() => {
    if (stallTimer !== undefined) {
      clearTimeout(stallTimer)
    }
  })

  // With no mounted renderer, RouterCore's non-rendering transition path must
  // finish the load with `rendered: false`. A callback retained from the old
  // tree instead queues an acknowledgement that no Match tree can deliver.
  expect.soft(outcome).toBe('resolved')
  expect.soft(router.state.status).toBe('idle')
  expect(router.state.resolvedLocation?.pathname).toBe('/next')
})
