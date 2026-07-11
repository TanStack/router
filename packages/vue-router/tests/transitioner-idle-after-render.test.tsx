import { cleanup, render, screen } from '@testing-library/vue'
import { afterEach, expect, test } from 'vitest'
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
})

test('status becomes idle only after Vue commits the destination DOM', async () => {
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

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Index')).toBeInTheDocument()

  const destinationWasRenderedWhenIdle: Array<boolean> = []
  const subscription = router.stores.status.subscribe(() => {
    if (router.stores.status.get() === 'idle') {
      destinationWasRenderedWhenIdle.push(
        screen.queryByText('Next') !== null,
      )
    }
  })

  await router.navigate({ to: '/next' })
  expect(await screen.findByText('Next')).toBeInTheDocument()

  expect(destinationWasRenderedWhenIdle).toEqual([true])
  subscription.unsubscribe()
})
