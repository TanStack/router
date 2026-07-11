import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
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
})

test('onRendered describes the navigation from the previously rendered location', async () => {
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

  render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Index')).toBeInTheDocument()

  const onRendered = vi.fn()
  const unsubscribe = router.subscribe('onRendered', onRendered)

  await router.navigate({ to: '/next' })
  expect(await screen.findByText('Next')).toBeInTheDocument()
  await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1))

  const event = onRendered.mock.calls[0]![0]
  expect(event.fromLocation?.pathname).toBe('/')
  expect(event.toLocation.pathname).toBe('/next')
  expect(event.pathChanged).toBe(true)
  expect(event.hrefChanged).toBe(true)

  const previousKey = event.toLocation.state.__TSR_key
  await router.navigate({
    to: '/next',
    state: { sameHrefState: true } as any,
  })
  await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(2))

  const stateEvent = onRendered.mock.calls[1]![0]
  expect(stateEvent.fromLocation?.state.__TSR_key).toBe(previousKey)
  expect(stateEvent.toLocation.state.__TSR_key).not.toBe(previousKey)
  expect(stateEvent.fromLocation?.href).toBe('/next')
  expect(stateEvent.toLocation.href).toBe('/next')
  expect(stateEvent.hrefChanged).toBe(false)

  unsubscribe()
})
