import { cleanup, render, screen, waitFor } from '@testing-library/vue'
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
  vi.restoreAllMocks()
})

test('an unmounted provider cannot acknowledge a later navigation as rendered', async () => {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
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

  const onRendered = vi.fn()
  const unsubscribe = router.subscribe('onRendered', onRendered)
  rendered.unmount()

  try {
    await router.navigate({ to: '/next' })

    expect(router.state.status).toBe('idle')
    expect(router.state.resolvedLocation?.pathname).toBe('/next')
    expect(onRendered).not.toHaveBeenCalled()
  } finally {
    unsubscribe()
  }
})
